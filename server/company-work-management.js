import {
  validatePlan,
  containsPrivateCredential,
} from "../site/company-v2-model.js";
const done = new Set(["completed", "cancelled"]);
const fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
export function mountWorkManagement(router, { store, pool, route, tick }) {
  router.get(
    "/company/work-history",
    route(async (req, res) => {
      const limit = Math.min(
        100,
        Math.max(1, Math.trunc(Number(req.query.limit)) || 40),
      );
      const offset = Math.max(
        0,
        Math.min(100000, Math.trunc(Number(req.query.offset)) || 0),
      );
      const rows = await pool.query(
        "SELECT id,revision,state,value->>'title' title,value->>'phase' phase,value->>'recipeId' AS \"recipeId\",value->>'paused' AS paused,updated_at AS \"updatedAt\" FROM company_jobs WHERE ($3::text IS NULL OR value->>'recipeId'=$3) AND ($4::boolean=false OR state NOT IN ('completed','cancelled')) AND ($5::boolean=false OR value ? 'automation') ORDER BY updated_at DESC,id DESC LIMIT $1 OFFSET $2",
        [
          limit + 1,
          offset,
          req.query.recipeId || null,
          req.query.active === "true",
          req.query.automated === "true",
        ],
      );
      res.json({
        jobs: rows.rows.slice(0, limit),
        hasMore: rows.rows.length > limit,
      });
    }),
  );
  router.get(
    "/company/messages",
    route(async (req, res) => {
      if (!/^[a-f0-9-]{36}$/i.test(req.query.jobId || ""))
        fail("Choose a task.");
      const rows = (
        await pool.query(
          "SELECT id,role,content,created_at FROM company_messages WHERE job_id=$1 AND content<>'' ORDER BY created_at DESC,id DESC LIMIT 501",
          [req.query.jobId],
        )
      ).rows;
      res.json({
        messages: rows.slice(0, 500).reverse(),
        truncated: rows.length > 500,
      });
    }),
  );
  router.delete(
    "/company/messages",
    route(async (req, res) => {
      const id = req.body?.jobId;
      if (id && !/^[a-f0-9-]{36}$/i.test(id)) fail("Invalid work ID.");
      // Retain request IDs for delivery deduplication; erase displayed chat content only.
      const result = await pool.query(
        "UPDATE company_messages SET content='' WHERE content<>'' AND ($1::uuid IS NULL OR job_id=$1)",
        [id || null],
      );
      res.json({ cleared: result.rowCount, jobsRetained: true });
    }),
  );
  router.post(
    "/company/jobs/:id/control",
    route(async (req, res) => {
      const { action, revision } = req.body || {};
      if (!["pause", "resume", "stop"].includes(action))
        fail("Choose pause, resume or stop.");
      const job = await store.tx(async (db) => {
        const j = await store.get(req.params.id, db, true);
        if (!j) fail("Work not found.", 404);
        if (j.revision !== revision)
          fail("This work changed. Refresh first.", 409);
        if (done.has(j.state)) fail("This work has already finished.", 409);
        if (action === "resume") {
          if (!j.paused || j.controlRequest)
            fail("Wait until the pending control request is applied.", 409);
          j.state = j.resumeState || "queued";
          delete j.paused;
          delete j.resumeState;
          if (j.phase === "execute" && j.state === "queued") j.question = null;
          await store.save(j, db);
        } else if (j.state === "running") {
          // A running worker owns the revision. Record a cooperative request without
          // invalidating its in-flight result. It observes this at the next safe boundary.
          await db.query(
            "UPDATE company_jobs SET value=jsonb_set(value,'{controlRequest}',$2::jsonb) WHERE id=$1",
            [j.id, JSON.stringify(action)],
          );
          j.controlRequest = action;
        } else {
          if (action === "pause" && j.paused) return j;
          await db.query(
            "UPDATE company_jobs SET value=value-'controlRequest' WHERE id=$1",
            [j.id],
          );
          delete j.controlRequest;
          if (action === "pause") {
            j.resumeState = j.state;
            j.paused = true;
            j.state = "waiting_input";
          } else {
            j.state = "cancelled";
            delete j.paused;
            delete j.resumeState;
          }
          await store.save(j, db);
        }
        return j;
      });
      res.status(202).json({ job, durable: true });
      void tick();
    }),
  );
  router.put(
    "/company/jobs/:id/plan",
    route(async (req, res) => {
      const job = await store.tx(async (db) => {
        const j = await store.get(req.params.id, db, true);
        if (!j || j.revision !== req.body?.revision)
          fail("This work changed. Refresh first.", 409);
        if (
          !j.paused ||
          j.controlRequest ||
          j.automation ||
          j.phase !== "execute"
        )
          fail(
            "Pause a manual executable workflow before editing its pending steps.",
            409,
          );
        const locked = j.steps.filter((s) => s.state !== "pending");
        if (containsPrivateCredential(JSON.stringify(req.body.plan)))
          fail("Keep credentials in Connections, not workflow inputs.");
        const plan = validatePlan(req.body.plan, {
          connections: await store.connections(db),
          skills: (await store.settings(db)).skills,
        });
        // validate the entire DAG; completed/claimed results can never be edited or replayed.
        const shape = (s) =>
          Object.fromEntries(
            [
              "id",
              "title",
              "tool",
              "skill",
              "connection",
              "args",
              "dependsOn",
              "when",
              "operation",
              "connectionSlot",
            ].map((k) => [k, s[k]]),
          );
        if (
          locked.some((s) => {
            const next = plan.steps.find((v) => v.id === s.id);
            return (
              !next || JSON.stringify(shape(next)) !== JSON.stringify(shape(s))
            );
          })
        )
          fail(
            "Keep completed or already-started blocks unchanged. Only pending blocks can be edited.",
          );
        j.title = plan.title;
        j.steps = plan.steps.map((s) => locked.find((v) => v.id === s.id) || s);
        await store.save(j, db);
        return j;
      });
      res.json({ job, durable: true });
    }),
  );
  router.delete(
    "/company/connections/:id",
    route(async (req, res) => {
      await store.tx(async (db) => {
        const c = (
          await db.query(
            "SELECT revision FROM company_connections WHERE id=$1 FOR UPDATE",
            [req.params.id],
          )
        ).rows[0];
        if (!c) fail("Connection not found.", 404);
        if (c.revision !== req.body?.revision)
          fail("This connection changed. Refresh first.", 409);
        const used = await db.query(
          "SELECT id FROM company_jobs WHERE state NOT IN ('completed','cancelled') AND value->'steps' @> $1::jsonb LIMIT 1",
          [JSON.stringify([{ connection: req.params.id }])],
        );
        const scheduled = await db.query(
          "SELECT id FROM company_recipes WHERE value->'automation'->>'enabled'='true' AND value->'procedure' @> $1::jsonb LIMIT 1",
          [JSON.stringify([{ connection: req.params.id }])],
        );
        if (used.rowCount || scheduled.rowCount)
          fail(
            "Stop dependent work and disable its automation before deleting this connection.",
            409,
          );
        await db.query("DELETE FROM company_connections WHERE id=$1", [
          req.params.id,
        ]);
        await db.query("DELETE FROM ai_credentials WHERE id=$1", [
          "company_" + req.params.id,
        ]);
      });
      res.json({ deleted: true });
    }),
  );
}
