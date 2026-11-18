import { isDeepStrictEqual } from "node:util";
import express from "express";
import { randomUUID, randomBytes, createHash } from "node:crypto";
const hash = (v) => createHash("sha256").update(v).digest("hex");
const uuid = (v) => typeof v === "string" && /^[a-f0-9-]{36}$/.test(v);
const run = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res)).catch(next);
const fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
export async function listDevices(pool) {
  return (
    await pool.query(
      "SELECT id,name,capabilities,last_seen,revoked_at FROM company_devices ORDER BY created_at DESC LIMIT 30",
    )
  ).rows.map((d) => ({
    id: d.id,
    name: d.name,
    capabilities: d.capabilities,
    lastSeen: d.last_seen,
    revoked: !!d.revoked_at,
    online:
      !d.revoked_at &&
      Date.now() - new Date(d.last_seen || 0).getTime() < 45000,
  }));
}
export function mountDeviceOwner(router, { pool, route = run }) {
  router.get(
    "/company/devices",
    route(async (_req, res) => res.json({ devices: await listDevices(pool) })),
  );
  router.post(
    "/company/devices",
    route(async (req, res) => {
      if (
        typeof req.body?.name !== "string" ||
        !req.body.name.trim() ||
        req.body.name.length > 80
      )
        fail("Name this computer.");
      if (
        (
          await pool.query(
            "SELECT count(*) FROM company_devices WHERE revoked_at IS NULL",
          )
        ).rows[0].count >= 20
      )
        fail("Revoke an unused device before pairing another.");
      const id = randomUUID(),
        token = randomBytes(32).toString("base64url");
      await pool.query(
        "INSERT INTO company_devices(id,name,token_hash,generation) VALUES($1,$2,$3,$4)",
        [id, req.body.name.trim(), hash(token), randomUUID()],
      );
      res.json({ id, token, shownOnce: true });
    }),
  );
  router.post(
    "/company/devices/:id/revoke",
    route(async (req, res) => {
      if (!uuid(req.params.id)) fail("Invalid device.");
      await pool.query(
        "UPDATE company_devices SET revoked_at=now(),generation=$2 WHERE id=$1",
        [req.params.id, randomUUID()],
      );
      await pool.query(
        "UPDATE company_device_tasks SET state='expired' WHERE device_id=$1 AND state IN ('queued','claimed')",
        [req.params.id],
      );
      res.json({
        revoked: true,
        note: "No new commands can be received. An already running local command cannot be undone.",
      });
    }),
  );
}
export function deviceAgentRouter(pool) {
  const router = express.Router();
  router.use("/api/device-link", express.json({ limit: "1200kb" }));
  router.use("/api/device-link", (req, res, next) => {
    (async () => {
      const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(
        req.headers.authorization || "",
      )?.[1];
      if (!token)
        return res
          .status(401)
          .json({ error: "Device authentication required." });
      const d = (
        await pool.query(
          "SELECT * FROM company_devices WHERE token_hash=$1 AND revoked_at IS NULL",
          [hash(token)],
        )
      ).rows[0];
      if (!d)
        return res
          .status(401)
          .json({ error: "Device was revoked or its token is invalid." });
      req.device = d;
      next();
    })().catch(next);
  });
  router.post(
    "/api/device-link/poll",
    run(async (req, res) => {
      const d = req.device,
        c = req.body?.capabilities;
      if (
        !c ||
        !["desktop", "server"].includes(c.execution) ||
        !Array.isArray(c.actions) ||
        c.actions.length > 50 ||
        c.actions.some(
          (a) =>
            !a ||
            !/^[a-z][a-z0-9_-]{0,59}$/.test(a.id) ||
            !["read", "write"].includes(a.effect) ||
            typeof a.description !== "string" ||
            a.description.length > 2000,
        )
      )
        fail("Invalid device capabilities.");
      const caps = {
        execution: c.execution,
        unattended: c.execution === "server" && c.unattended === true,
        platform: String(c.platform || "").slice(0, 60),
        fullControl: c.fullControl === true,
        roots: Array.isArray(c.roots)
          ? c.roots
              .filter((r) => typeof r === "string" && r.length < 80)
              .slice(0, 20)
          : [],
        actions: c.actions.map((a) => ({
          id: a.id,
          effect: a.effect,
          description: a.description,
          unattended: a.unattended === true,
        })),
        pythonImageReady: c.pythonImageReady === true,
      };
      // Heartbeats do not revise connection scope; only configuration changes do.
      if (
        !d.last_seen ||
        Date.now() - new Date(d.last_seen).getTime() > 20000 ||
        !isDeepStrictEqual(d.capabilities, caps)
      )
        await pool.query(
          "UPDATE company_devices SET capabilities=$2,last_seen=now() WHERE id=$1 AND revoked_at IS NULL",
          [d.id, JSON.stringify(caps)],
        );
      const claim = randomBytes(24).toString("base64url");
      const r = await pool.query(
        "UPDATE company_device_tasks SET state='claimed',claim_hash=$3 WHERE id=(SELECT id FROM company_device_tasks WHERE device_id=$1 AND generation=$2 AND state='queued' AND deadline>now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) AND EXISTS(SELECT 1 FROM company_devices WHERE id=$1 AND revoked_at IS NULL AND generation=$2) RETURNING id,action,input,deadline",
        [d.id, d.generation, hash(claim)],
      );
      res.json({
        task: r.rows[0] ? { ...r.rows[0], claim } : null,
        pollAfterSeconds: 3,
      });
    }),
  );
  router.post(
    "/api/device-link/tasks/:id/result",
    run(async (req, res) => {
      if (
        !uuid(req.params.id) ||
        typeof req.body?.claim !== "string" ||
        req.body.claim.length > 100 ||
        typeof req.body.ok !== "boolean" ||
        JSON.stringify(req.body.output || {}).length > 1050000
      )
        fail("Invalid task result.");
      const result = req.body.ok
        ? { ok: true, output: req.body.output }
        : {
            ok: false,
            error: String(req.body.error || "The device action failed.").slice(
              0,
              500,
            ),
          };
      const r = await pool.query(
        "UPDATE company_device_tasks SET state=$4,output=$5 WHERE id=$1 AND device_id=$2 AND claim_hash=$3 AND state='claimed' AND generation=$6 AND deadline>now() AND EXISTS(SELECT 1 FROM company_devices WHERE id=$2 AND revoked_at IS NULL AND generation=$6) RETURNING id",
        [
          req.params.id,
          req.device.id,
          hash(req.body.claim),
          req.body.ok ? "completed" : "failed",
          JSON.stringify(result),
          req.device.generation,
        ],
      );
      if (!r.rowCount)
        fail(
          "Task expired, was already acknowledged or the device was revoked.",
          409,
        );
      res.json({ acknowledged: true });
    }),
  );
  router.use("/api/device-link", (error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error.status || 503).json({
      error: error.status
        ? error.message
        : "Device request was not acknowledged.",
    });
  });
  return router;
}
export async function deviceInvoke(
  pool,
  deviceId,
  action,
  input,
  { signal, expectedEffect } = {},
) {
  const d = (
    await pool.query(
      "SELECT * FROM company_devices WHERE id=$1 AND revoked_at IS NULL",
      [deviceId],
    )
  ).rows[0];
  if (
    !d ||
    !d.last_seen ||
    Date.now() - new Date(d.last_seen).getTime() > 45000
  )
    throw Error(
      "Your computer is offline. Start the TH device agent and keep the laptop awake.",
    );
  const capability = d.capabilities.actions?.find(
    (a) => a.id === (action === "ping" ? input.action : action),
  );
  if (action === "ping")
    return {
      ok: true,
      output: {
        execution: d.capabilities.execution,
        unattended: !!capability?.unattended && d.capabilities.unattended,
        platform: d.capabilities.platform,
        pythonImageReady: d.capabilities.pythonImageReady,
      },
    };
  if (!capability)
    throw Error(
      "This action is not enabled on the paired computer. Edit its local permissions or choose an available action.",
    );
  if (expectedEffect && capability.effect !== expectedEffect)
    throw Error(
      "The computer action permissions changed. Reconfigure and verify this connection before running it.",
    );
  const id = randomUUID();
  await pool.query(
    "INSERT INTO company_device_tasks(id,device_id,generation,action,input,state,deadline) VALUES($1,$2,$3,$4,$5,'queued',now()+interval '55 seconds')",
    [id, deviceId, d.generation, action, JSON.stringify(input)],
  );
  let claimed = false;
  try {
    while (!signal?.aborted) {
      const r = (
        await pool.query(
          "SELECT state,output FROM company_device_tasks WHERE id=$1",
          [id],
        )
      ).rows[0];
      if (r?.state === "completed") return r.output;
      if (r?.state === "failed")
        throw Object.assign(
          Error(r.output?.error || "The device action failed."),
          { uncertain: capability.effect !== "read" },
        );
      if (r?.state === "claimed") claimed = true;
      if (r?.state === "expired") break;
      const expired = (
        await pool.query(
          "SELECT deadline<now() AS expired FROM company_device_tasks WHERE id=$1",
          [id],
        )
      ).rows[0]?.expired;
      if (expired) break;
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  } finally {
    const expired = await pool.query(
      "UPDATE company_device_tasks SET state='expired' WHERE id=$1 AND state IN ('queued','claimed') RETURNING claim_hash",
      [id],
    );
    claimed = claimed || expired.rows.some((row) => !!row.claim_hash);
  }
  throw Object.assign(
    Error(
      claimed
        ? "The computer did not acknowledge the result. Check it before retrying; the command will not be replayed."
        : "The computer did not pick up the action. Check the agent connection.",
    ),
    { uncertain: claimed && capability.effect !== "read" },
  );
}
