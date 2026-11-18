import { randomUUID } from "node:crypto";
import { defaultCompanySettings } from "../site/company-v2-model.js";
export class CompanyStore {
  constructor(pool) {
    this.pool = pool;
  }
  async tx(fn) {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      const value = await fn(db);
      await db.query("COMMIT");
      return value;
    } catch (e) {
      await db.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      db.release();
    }
  }
  async settings(db = this.pool) {
    const r = (
      await db.query(
        "SELECT revision,value FROM company_settings WHERE id=true",
      )
    ).rows[0];
    return r
      ? { revision: r.revision, ...r.value }
      : { revision: 0, ...defaultCompanySettings() };
  }
  async connections(db = this.pool) {
    return (
      await db.query(
        "SELECT id,revision,value FROM company_connections ORDER BY updated_at DESC LIMIT 100",
      )
    ).rows.map((r) => ({ ...r.value, id: r.id, revision: r.revision }));
  }
  async recipes() {
    return (
      await this.pool.query(
        `SELECT id,value,revision FROM (SELECT id,value,revision,updated_at FROM company_recipes UNION ALL SELECT id,jsonb_build_object('title',title,'instructions',title,'source','legacy-workflow','sourceWorkflowId',id,'legacyAutomationWasEnabled',active) AS value,0 AS revision,updated_at FROM ai_workflows w WHERE NOT EXISTS(SELECT 1 FROM company_recipes r WHERE r.id=w.id)) recipes ORDER BY updated_at DESC LIMIT 100`,
      )
    ).rows.map((r) => ({ id: r.id, ...r.value, revision: r.revision }));
  }
  async messages() {
    return (
      await this.pool.query(
        "SELECT id,job_id,role,content,created_at FROM company_messages ORDER BY created_at DESC,id DESC LIMIT 100",
      )
    ).rows.reverse();
  }
  async jobs() {
    return (
      await this.pool.query(
        `SELECT id,revision,state,(value - ARRAY['inspectionEvidence','usage','answers','request','brief']) || jsonb_build_object('steps',coalesce((SELECT jsonb_agg((step - 'result') || jsonb_build_object('result',jsonb_build_object('rowCount',step->'result'->'rowCount','files',step->'result'->'files','receipt',step->'result'->'receipt','mediaUrls',step->'result'->'mediaUrls'))) FROM jsonb_array_elements(value->'steps') step),'[]'::jsonb)) AS value,updated_at FROM company_jobs ORDER BY updated_at DESC LIMIT 40`,
      )
    ).rows.map((r) => ({
      ...r.value,
      id: r.id,
      revision: r.revision,
      state: r.state,
      updatedAt: r.updated_at,
    }));
  }
  async get(id, db = this.pool, lock = false) {
    const row = (
      await db.query(
        "SELECT id,revision,state,value FROM company_jobs WHERE id=$1" +
          (lock ? " FOR UPDATE" : ""),
        [id],
      )
    ).rows[0];
    return row
      ? { ...row.value, id: row.id, revision: row.revision, state: row.state }
      : null;
  }
  async save(job, db = this.pool) {
    const { id, revision, state, ...value } = job;
    const r = await db.query(
      "UPDATE company_jobs SET state=$2,value=$3,revision=revision+1,updated_at=now() WHERE id=$1 AND revision=$4 RETURNING revision",
      [id, state, JSON.stringify(value), revision],
    );
    if (!r.rowCount)
      throw Object.assign(
        Error("This work changed. Refresh before continuing."),
        { status: 409 },
      );
    job.revision = r.rows[0].revision;
    return job;
  }
  async say(job, text, db = this.pool) {
    await db.query(
      "INSERT INTO company_messages(id,job_id,role,content) VALUES($1,$2,$3,$4)",
      [randomUUID(), job.id, "assistant", text],
    );
  }
  async enqueue({ requestId, text }) {
    try {
      return await this.tx(async (db) => {
        const old = (
          await db.query(
            "SELECT job_id FROM company_messages WHERE request_id=$1",
            [requestId],
          )
        ).rows[0];
        if (old) return { job: await this.get(old.job_id, db), reused: true };
        const job = {
          id: randomUUID(),
          revision: 1,
          state: "queued",
          phase: "assistant",
          request: text,
          language: /[àáạảãăâđêôơư]/i.test(text) ? "vi" : "en",
          title: text.slice(0, 90),
          calls: 0,
          steps: [],
          events: [{ at: new Date().toISOString(), text: "Request received" }],
        };
        await db.query(
          "INSERT INTO company_jobs(id,state,value) VALUES($1,$2,$3)",
          [job.id, job.state, JSON.stringify(job)],
        );
        await db.query(
          "INSERT INTO company_messages(id,request_id,job_id,role,content) VALUES($1,$2,$3,$4,$5)",
          [randomUUID(), requestId, job.id, "user", text],
        );
        return { job };
      });
    } catch (error) {
      if (error.code !== "23505") throw error;
      const old = (
        await this.pool.query(
          "SELECT job_id FROM company_messages WHERE request_id=$1",
          [requestId],
        )
      ).rows[0];
      if (!old) throw error;
      return { job: await this.get(old.job_id), reused: true };
    }
  }
  async claim() {
    return this.tx(async (db) => {
      const row = (
        await db.query(
          "SELECT id FROM company_jobs WHERE state='queued' AND coalesce((value->>'nextAttemptAt')::bigint,0)<$1 ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT 1",
          [Date.now()],
        )
      ).rows[0];
      if (!row) return null;
      const job = await this.get(row.id, db);
      job.state = "running";
      job.leaseUntil = Date.now() + 180000;
      await this.save(job, db);
      return job;
    });
  }
  async schedule() {
    return this.tx(async (db) => {
      const due = (
        await db.query(
          "SELECT id,revision,value FROM company_recipes WHERE value->'automation'->>'enabled'='true' ORDER BY updated_at FOR UPDATE SKIP LOCKED LIMIT 100",
        )
      ).rows;
      for (const recipe of due) {
        const a = recipe.value.automation,
          existing = (
            await db.query(
              "SELECT state FROM company_jobs WHERE value->>'recipeId'=$1 AND state IN ('queued','running','waiting_input','waiting_approval','uncertain') ORDER BY updated_at DESC LIMIT 1",
              [recipe.id],
            )
          ).rows[0];
        if (existing) {
          if (
            ["waiting_input", "waiting_approval", "uncertain"].includes(
              existing.state,
            )
          ) {
            a.enabled = false;
            a.pauseReason =
              "Your assistant needs input or approval on the previous run.";
            await db.query(
              "UPDATE company_recipes SET value=$2,revision=revision+1,updated_at=now() WHERE id=$1",
              [recipe.id, JSON.stringify({ ...recipe.value, automation: a })],
            );
          }
          continue;
        }
        if (a.nextRunAt > Date.now()) continue;
        const day = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Ho_Chi_Minh",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date()),
          used = a.day === day ? a.runs || 0 : 0;
        if (used >= a.maxRunsPerDay) continue;
        const job = {
          id: randomUUID(),
          revision: 1,
          state: "queued",
          phase: "director",
          language: recipe.value.language || "en",
          title: recipe.value.title,
          request: a.instructions || recipe.value.instructions,
          brief: a.instructions || recipe.value.instructions,
          recipeId: recipe.id,
          calls: 0,
          steps: [],
          events: [
            {
              at: new Date().toISOString(),
              text: "Scheduled run admitted on the server",
            },
          ],
          automation: {
            scope: a.scope,
            allowWrites: a.allowWrites,
            allowMedia: a.allowMedia,
            maxCalls: a.maxCalls,
            scheduledAt: new Date().toISOString(),
          },
        };
        await db.query(
          "INSERT INTO company_jobs(id,state,value) VALUES($1,$2,$3)",
          [job.id, job.state, JSON.stringify(job)],
        );
        a.day = day;
        a.runs = used + 1;
        a.nextRunAt = Date.now() + a.intervalMinutes * 60000;
        a.lastJobId = job.id;
        await db.query(
          "UPDATE company_recipes SET value=$2,revision=revision+1,updated_at=now() WHERE id=$1",
          [recipe.id, JSON.stringify({ ...recipe.value, automation: a })],
        );
        await this.say(
          job,
          "Automation started: " +
            job.title +
            ". This run continues on the server without an open browser.",
          db,
        );
      }
    });
  }
  async recover() {
    const rows = (
      await this.pool.query(
        "SELECT id FROM company_jobs WHERE state='running' AND (value->>'leaseUntil')::bigint<$1 LIMIT 10",
        [Date.now()],
      )
    ).rows;
    for (const row of rows)
      await this.tx(async (db) => {
        const job = await this.get(row.id, db, true);
        if (job.state !== "running" || job.leaseUntil >= Date.now()) return;
        const effect = job.steps.find(
          (s) =>
            s.state === "executing" && ["publish", "media"].includes(s.tool),
        );
        job.state = effect ? "uncertain" : "waiting_input";
        job.question = effect
          ? "The worker stopped after a publishing intent. Check Facebook before deciding whether to retry; I will not post a duplicate automatically."
          : "Processing was interrupted. Your request and confirmed steps are saved. Continue when ready; completed steps will not repeat.";
        await this.save(job, db);
        await this.say(job, job.question, db);
      });
  }
}
