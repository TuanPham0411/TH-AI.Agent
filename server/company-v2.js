import { gatewayRequest } from "./company-v2-gateway.js";
import { randomUUID } from "node:crypto";
import { CompanyStore } from "./company-v2-store.js";
import { CompanyRunner } from "./company-v2-runner.js";
import {
  createCompanyTools,
  payloadHash,
  resolveToolStep,
} from "./company-v2-tools.js";
import {
  defaultCompanySettings,
  validateSettings,
  safePublicMessage,
  containsPrivateCredential,
} from "../site/company-v2-model.js";
const uuid = (v) =>
    typeof v === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v),
  fail = (m, status = 400) => {
    throw Object.assign(Error(m), { status });
  };
export function mountCompanyV2(
  router,
  {
    pool,
    route,
    getSecret,
    setSecret,
    model,
    tool,
    store = new CompanyStore(pool),
    background = process.env.NODE_ENV === "production",
  },
) {
  const runners = Array.from(
      { length: 2 },
      () =>
        new CompanyRunner({
          store,
          getSecret,
          model,
          tool: tool || createCompanyTools({ pool, getSecret }),
        }),
    ),
    runner = runners[0],
    ticks = new Set();
  let scheduling = false,
    stopped = false,
    timer;
  const tick = () => {
    if (stopped) return Promise.resolve();
    const work = (async () => {
      try {
        if (!scheduling) {
          scheduling = true;
          try {
            await store.schedule();
          } finally {
            scheduling = false;
          }
        }
        if (!stopped) await Promise.all(runners.map((r) => r.tick()));
      } catch {}
    })();
    ticks.add(work);
    void work.finally(() => ticks.delete(work));
    return work;
  };
  if (background) {
    timer = setInterval(tick, 3000);
    timer.unref();
    setTimeout(tick, 100).unref();
  }
  router.get(
    "/company/workspace",
    route(async (req, res) => {
      const [settings, connections, recipes, jobs, messages] =
        await Promise.all([
          store.settings(),
          store.connections(),
          store.recipes(),
          store.jobs(),
          store.messages(),
        ]);
      const providers = {};
      for (const slot of ["assistant", "director"])
        providers[slot] = !!(
          (await getSecret(
            "company_ai_" + slot + "_" + settings[slot].provider,
          )) || (await getSecret(settings[slot].provider))
        )?.key;
      res.json({
        settings,
        providers,
        connections,
        recipes,
        jobs: jobs.map((job) => ({
          ...job,
          inspectionEvidence: undefined,
          steps: job.steps.map(({ result, ...step }) => ({
            ...step,
            result: result
              ? {
                  rowCount: result.rowCount,
                  files: result.files,
                  receipt: result.receipt,
                  mediaUrls: result.mediaUrls,
                }
              : undefined,
          })),
        })),
        messages,
        version: 2,
      });
    }),
  );
  router.get(
    "/company/jobs/:id",
    route(async (req, res) => {
      if (!uuid(req.params.id)) fail("Invalid work ID.");
      const job = await store.get(req.params.id);
      if (!job) fail("Work not found.", 404);
      res.json({ job });
    }),
  );
  router.post(
    "/company/messages",
    route(async (req, res) => {
      const { text, requestId } = req.body || {};
      if (
        !uuid(requestId) ||
        typeof text !== "string" ||
        !text.trim() ||
        text.length > 16000
      )
        fail(
          "Send a request with a unique request ID (up to 16,000 characters).",
        );
      if (containsPrivateCredential(text))
        fail(
          "Use the secure connection form for passwords and API keys; they must not enter conversation history.",
        );
      const result = await store.enqueue({ requestId, text: text.trim() });
      res.status(result.reused ? 200 : 202).json({ ...result, durable: true });
      void tick();
    }),
  );
  router.put(
    "/company/settings",
    route(async (req, res) => {
      const { revision, ...input } = req.body || {},
        value = validateSettings(input);
      const next = await store.tx(async (db) => {
        const created = await db.query(
          "INSERT INTO company_settings(id,revision,value) VALUES(true,1,$1) ON CONFLICT DO NOTHING RETURNING revision",
          [JSON.stringify(defaultCompanySettings())],
        );
        const current = (
          await db.query(
            "SELECT revision,value FROM company_settings WHERE id=true FOR UPDATE",
          )
        ).rows[0];
        if (
          !(revision === 0 && created.rowCount === 1) &&
          revision !== current.revision
        )
          fail("Company settings changed. Reload before saving.", 409);
        const row = (
          await db.query(
            "UPDATE company_settings SET value=$1,revision=revision+1,updated_at=now() WHERE id=true RETURNING revision",
            [JSON.stringify(value)],
          )
        ).rows[0];
        return { ...value, revision: row.revision };
      });
      res.json({ settings: next, durable: true });
    }),
  );
  router.put(
    "/company/model-key/:slot",
    route(async (req, res) => {
      if (
        !["assistant", "director"].includes(req.params.slot) ||
        !["gemini", "openai", "anthropic"].includes(req.body?.provider) ||
        typeof req.body?.key !== "string" ||
        req.body.key.length < 8 ||
        req.body.key.length > 5000
      )
        fail("Provide the API key in the secure field.");
      await setSecret(
        "company_ai_" + req.params.slot + "_" + req.body.provider,
        { key: req.body.key },
      );
      res.json({ saved: true, durable: true });
    }),
  );
  router.put(
    "/company/connections/:id",
    route(async (req, res) => {
      const id = req.params.id;
      if (!/^[a-z][a-z0-9_-]{0,59}$/.test(id))
        fail("Use a short connection ID, such as odssg_vn.");
      const {
        kind,
        name,
        accountId,
        baseUrl,
        model: mediaModel,
        mediaType,
        action,
        description,
        effect,
        allowWrites = false,
        allowMedia = false,
        allowPublish = false,
        revision = 0,
        secret = {},
      } = req.body || {};
      if (
        ![
          "odbc",
          "postgres",
          "mysql",
          "sqlserver",
          "oracle",
          "mongo",
          "firestore",
          "facebook",
          "media",
          "bridge",
        ].includes(kind) ||
        typeof name !== "string" ||
        !name.trim() ||
        name.length > 100 ||
        typeof allowPublish !== "boolean"
      )
        fail("Choose a supported connection and name.");
      if (kind === "facebook" && !/^\d{4,30}$/.test(accountId || ""))
        fail(
          "Enter the numeric Facebook Page ID. Personal-profile passwords are not supported.",
        );
      if (["odbc", "bridge"].includes(kind)) {
        let u;
        try {
          u = new URL(baseUrl);
        } catch {}
        if (
          !u ||
          u.protocol !== "https:" ||
          u.username ||
          u.password ||
          u.search ||
          u.hash
        )
          fail("Use an HTTPS ODBC gateway URL without embedded secrets.");
      }
      if (
        kind === "media" &&
        (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(mediaModel || "") ||
          !["text_to_image", "text_to_video"].includes(mediaType))
      )
        fail("Choose the media service owner/model ID and output type.");
      if (
        kind === "bridge" &&
        (!/^[a-z][a-z0-9_-]{0,59}$/.test(action || "") ||
          typeof description !== "string" ||
          description.length > 3000 ||
          !["read", "write"].includes(effect) ||
          typeof allowWrites !== "boolean")
      )
        fail("Choose an approved personal action and its read/write effect.");
      const allowed = ["key", "connectionString", "projectId"];
      if (
        !secret ||
        typeof secret !== "object" ||
        Array.isArray(secret) ||
        Object.keys(secret).some(
          (k) =>
            !allowed.includes(k) ||
            typeof secret[k] !== "string" ||
            secret[k].length > 8000,
        )
      )
        fail("Use the supported secure credential fields.");
      const value = {
        name: name.trim(),
        kind,
        ...(kind === "facebook" ? { accountId, allowPublish } : {}),
        ...(["odbc", "bridge"].includes(kind) ? { baseUrl } : {}),
        ...(kind === "bridge"
          ? {
              baseUrl,
              action,
              description,
              effect,
              allowWrites,
              execution: "unverified",
              unattended: false,
            }
          : {}),
        ...(kind === "media"
          ? { model: mediaModel, mediaType, allowMedia: allowMedia === true }
          : {}),
      };
      await store.tx(async (db) => {
        const old = (
          await db.query(
            "SELECT revision,value FROM company_connections WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (old && old.value.kind !== kind)
          fail("Use a new connection ID to change connection kind.");
        if ((old?.revision || 0) !== revision)
          fail("This connection changed. Reload before saving.", 409);
        const previous =
          (
            await db.query(
              "SELECT secret FROM ai_credentials WHERE id=$1 FOR UPDATE",
              ["company_" + id],
            )
          ).rows[0]?.secret || {};
        const merged = {
          ...previous,
          ...Object.fromEntries(
            Object.entries(secret).filter(([, v]) => v.trim()),
          ),
          ...(["odbc", "bridge"].includes(kind) ? { baseUrl } : {}),
          ...(kind === "bridge"
            ? {
                baseUrl,
                action,
                description,
                effect,
                allowWrites,
                execution: "unverified",
                unattended: false,
              }
            : {}),
          ...(kind === "media"
            ? { model: mediaModel, mediaType, allowMedia: allowMedia === true }
            : {}),
        };
        if (
          ["facebook", "odbc", "media", "bridge"].includes(kind) &&
          !merged.key
        )
          fail("Provide the access token in the secure field.");
        if (
          ["postgres", "mysql", "sqlserver", "oracle", "mongo"].includes(
            kind,
          ) &&
          !merged.connectionString
        )
          fail("Provide a read-only database connection in the secure field.");
        await db.query(
          "INSERT INTO ai_credentials(id,secret) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET secret=excluded.secret,updated_at=now()",
          ["company_" + id, JSON.stringify(merged)],
        );
        await db.query(
          "INSERT INTO company_connections(id,value) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET value=excluded.value,revision=company_connections.revision+1,updated_at=now()",
          [id, JSON.stringify(value)],
        );
      });
      res.json({ saved: true, durable: true });
    }),
  );
  router.post(
    "/company/connections/:id/check",
    route(async (req, res) => {
      const connection = (await store.connections()).find(
        (c) => c.id === req.params.id,
      );
      if (connection?.kind !== "bridge") fail("Choose a personal tool bridge.");
      const secret = await getSecret("company_" + connection.id);
      if (!secret?.key) fail("Save the private bridge token first.");
      const path = "/actions/ping/invoke",
        response = await gatewayRequest(secret.baseUrl, { path })(
          new URL(path, secret.baseUrl),
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + secret.key,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ input: { action: connection.action } }),
            signal: AbortSignal.timeout(20000),
          },
        );
      if (
        response?.ok !== true ||
        !["server", "desktop"].includes(response.output?.execution)
      )
        fail("The bridge did not confirm its execution environment.");
      const { execution, unattended, platform, pythonImageReady } =
        response.output;
      await store.tx(async (db) => {
        const row = (
          await db.query(
            "SELECT revision,value FROM company_connections WHERE id=$1 FOR UPDATE",
            [connection.id],
          )
        ).rows[0];
        if (row.revision !== connection.revision)
          fail("The connection changed during verification.", 409);
        await db.query(
          "UPDATE company_connections SET value=$2,revision=revision+1,updated_at=now() WHERE id=$1",
          [
            connection.id,
            JSON.stringify({
              ...row.value,
              execution,
              unattended: unattended === true,
              platform,
              pythonImageReady,
              verifiedAt: new Date().toISOString(),
            }),
          ],
        );
      });
      res.json({
        verified: true,
        execution,
        unattended: unattended === true,
        pythonImageReady,
        durable: true,
      });
    }),
  );
  router.put(
    "/company/recipes/:id/automation",
    route(async (req, res) => {
      if (!uuid(req.params.id)) fail("Invalid workflow ID.");
      const {
        enabled,
        revision,
        intervalMinutes = 30,
        maxRunsPerDay = 12,
        maxCalls = 4,
        allowWrites = false,
        allowMedia = false,
      } = req.body || {};
      if (
        typeof enabled !== "boolean" ||
        typeof allowWrites !== "boolean" ||
        typeof allowMedia !== "boolean" ||
        !Number.isInteger(intervalMinutes) ||
        intervalMinutes < 1 ||
        intervalMinutes > 1440 ||
        !Number.isInteger(maxRunsPerDay) ||
        maxRunsPerDay < 1 ||
        maxRunsPerDay > 100 ||
        !Number.isInteger(maxCalls) ||
        maxCalls < 1 ||
        maxCalls > 12
      )
        fail("Choose a bounded schedule, daily run limit and model budget.");
      const recipe = await store.tx(async (db) => {
        const row = (
          await db.query(
            "SELECT revision,value FROM company_recipes WHERE id=$1 FOR UPDATE",
            [req.params.id],
          )
        ).rows[0];
        if (!row || row.revision !== revision)
          fail(
            "Run and verify this workflow first, then refresh its automation settings.",
            409,
          );
        const connections = await store.connections(db),
          operational = (row.value.procedure || []).some(
            (s) => s.verifiedServerRun,
          )
            ? (row.value.procedure || []).filter(
                (s) => !["inspect_python", "stage_python"].includes(s.tool),
              )
            : row.value.procedure || [],
          scope = operational.map((s) => ({
            tool: s.tool,
            connection: s.connection || null,
            connectionRevision:
              connections.find((c) => c.id === s.connection)?.revision || 0,
            ...(s.toolId ? { toolId: s.toolId } : {}),
          }));
        if (enabled && !scope.length)
          fail("A tested procedure is required before automation.");
        if (
          enabled &&
          scope.some((s) => {
            const c = connections.find((c) => c.id === s.connection);
            return (
              c?.kind === "bridge" &&
              (c.execution !== "server" ||
                !c.unattended ||
                !c.verifiedAt ||
                (c.action === "run_python_tool" && !c.pythonImageReady))
            );
          })
        ) {
          const message =
            "I cannot enable independent automation for a laptop/desktop-only or unverified tool. Keep this workflow manual. If Python source is available, I can inspect its folder without running it locally, assess portability, and test a suitable version on the server.";
          const latest = (
            await db.query(
              "SELECT id FROM company_jobs WHERE value->>'recipeId'=$1 ORDER BY updated_at DESC LIMIT 1",
              [req.params.id],
            )
          ).rows[0];
          if (latest) await store.say({ id: latest.id }, message, db);
          return { refused: true, message };
        }
        const settings = await store.settings(db);
        if (enabled && !settings.policy.allowPaid)
          fail("Enable the bounded AI processing policy before automation.");
        if (
          enabled &&
          scope.some(
            (s) =>
              ["publish", "stage_python"].includes(s.tool) ||
              (s.tool === "bridge" &&
                connections.find((c) => c.id === s.connection)?.effect !==
                  "read"),
          ) &&
          !allowWrites
        )
          fail(
            "Approve this workflow’s listed write/publication scope before enabling it.",
          );
        if (enabled && scope.some((s) => s.tool === "media") && !allowMedia)
          fail(
            "Approve this workflow’s media generation charges before enabling it.",
          );
        const value = {
          ...row.value,
          automation: {
            instructions: operational.some((s) => s.verifiedServerRun)
              ? "Run the already verified server tools using the fixed toolId and saved inputs in this recipe. Do not repeat inspection or transfer. Original goal: " +
                row.value.instructions
              : null,
            enabled,
            intervalMinutes,
            maxRunsPerDay,
            maxCalls,
            allowWrites,
            allowMedia,
            scope,
            nextRunAt: Date.now() + intervalMinutes * 60000,
            day: null,
            runs: 0,
          },
        };
        await db.query(
          "UPDATE company_recipes SET value=$2,revision=revision+1,updated_at=now() WHERE id=$1",
          [req.params.id, JSON.stringify(value)],
        );
        if (!enabled)
          await db.query(
            "UPDATE company_jobs SET state='cancelled',revision=revision+1 WHERE state='queued' AND value->>'recipeId'=$1 AND value ? 'automation'",
            [req.params.id],
          );
        return { id: req.params.id, ...value, revision: row.revision + 1 };
      });
      if (recipe.refused)
        return res
          .status(400)
          .json({ error: recipe.message, assistance: true });
      res.json({ recipe, durable: true });
    }),
  );
  router.post(
    "/company/jobs/:id/skill",
    route(async (req, res) => {
      if (!uuid(req.params.id)) fail("Invalid work ID.");
      const job = await store.tx(async (db) => {
        const job = await store.get(req.params.id, db, true);
        if (
          !job ||
          job.state !== "waiting_input" ||
          job.revision !== req.body?.revision ||
          !job.needs?.skill
        )
          fail("This skill proposal changed. Refresh before approving.", 409);
        await db.query(
          "INSERT INTO company_settings(id,revision,value) VALUES(true,1,$1) ON CONFLICT DO NOTHING",
          [JSON.stringify(defaultCompanySettings())],
        );
        const current = (
          await db.query(
            "SELECT revision,value FROM company_settings WHERE id=true FOR UPDATE",
          )
        ).rows[0];
        const skill = job.needs.skill;
        if (current.value.skills.some((s) => s.id === skill.id))
          fail(
            "That position already exists. Continue with the existing position.",
          );
        const value = validateSettings({
          ...current.value,
          skills: [...current.value.skills, skill],
        });
        await db.query(
          "UPDATE company_settings SET value=$1,revision=revision+1,updated_at=now() WHERE id=true",
          [JSON.stringify(value)],
        );
        job.phase = "director";
        job.state = "queued";
        job.needs = null;
        job.question = null;
        await store.save(job, db);
        await store.say(
          job,
          "The position is now a skill profile available to the Director. No additional AI model was created.",
          db,
        );
        return job;
      });
      res.status(202).json({ job, durable: true });
      void tick();
    }),
  );
  router.post(
    "/company/jobs/:id/respond",
    route(async (req, res) => {
      if (!uuid(req.params.id)) fail("Invalid work ID.");
      const { revision, text = "", action = "reply", hash } = req.body || {};
      if (
        !["reply", "approve", "cancel", "retry"].includes(action) ||
        typeof text !== "string" ||
        text.length > 16000
      )
        fail("Send a bounded response.");
      if (containsPrivateCredential(text))
        fail("Use the secure connection card for passwords and API keys.");
      const job = await store.tx(async (db) => {
        const job = await store.get(req.params.id, db, true);
        if (!job) fail("Work not found.", 404);
        if (job.revision !== revision)
          fail("This work changed. Refresh before continuing.", 409);
        if (action === "cancel") {
          if (job.state === "running")
            fail(
              "Wait for the current bounded tool call to finish before cancelling.",
              409,
            );
          job.state = "cancelled";
        } else if (action === "approve") {
          if (job.state !== "waiting_approval" || hash !== job.approval?.hash)
            fail("This publication approval has changed.", 409);
          const step = job.steps.find((s) => s.id === job.approval.stepId),
            connection = (await store.connections(db)).find(
              (c) => c.id === step?.connection,
            );
          if (!step) fail("The proposed step is missing.", 409);
          const actualHash = payloadHash(
            resolveToolStep(step, job.steps),
            connection,
          );
          if (actualHash !== hash) {
            job.approval = {
              ...job.approval,
              hash: actualHash,
              connection: connection?.name || step.connection,
            };
            job.question =
              "The destination settings changed. Please review and approve this updated request.";
            await store.save(job, db);
            await store.say(job, job.question, db);
            return job;
          }
          step.approvedHash = hash;
          job.state = "queued";
        } else if (action === "retry") {
          if (
            job.state !== "uncertain" ||
            req.body.acknowledgeDuplicateRisk !== true
          )
            fail(
              "Check the external platform and acknowledge duplicate risk first.",
            );
          for (const s of job.steps.filter(
            (s) => s.state === "uncertain" || s.state === "executing",
          )) {
            s.state = "pending";
            delete s.approvedHash;
          }
          job.state = "queued";
        } else {
          if (!["waiting_input", "waiting_approval"].includes(job.state))
            fail("This work is not waiting for input.", 409);
          job.answers = [...(job.answers || []), safePublicMessage(text)].slice(
            -12,
          );
          if (job.budgetUsed) {
            if (req.body.approveNewBudget !== true)
              fail("Approve a new bounded model allowance to continue.");
            job.calls = 0;
            job.budgetUsed = false;
          }
          job.state = "queued";
          job.approval = null;
          if (job.phase !== "assistant") job.phase = "director";
        }
        job.question = null;
        job.needs = null;
        await store.save(job, db);
        if (text)
          await db.query(
            "INSERT INTO company_messages(id,job_id,role,content) VALUES($1,$2,$3,$4)",
            [randomUUID(), job.id, "user", safePublicMessage(text)],
          );
        return job;
      });
      res.status(202).json({ job, durable: true });
      void tick();
    }),
  );
  return {
    runner,
    runners,
    tick,
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      const stopping = runners.map((r) => r.stop());
      await Promise.allSettled([...ticks, ...stopping]);
    },
  };
}
