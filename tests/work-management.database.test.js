import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { companyFixture } from "./company-v2-fixture.mjs";
import { defaultCompanySettings } from "../site/company-v2-model.js";
import { CompanyStore } from "../server/company-v2-store.js";
import { CompanyRunner } from "../server/company-v2-runner.js";
const enabled = { skip: !process.env.TEST_DATABASE_URL };
test(
  "review and edit real plans, retain results and deduplication when clearing chat, protect referenced connections",
  enabled,
  async (t) => {
    const f = await companyFixture(process.env.TEST_DATABASE_URL);
    t.after(() => f.close());
    const settings = { ...defaultCompanySettings(), revision: 0 };
    settings.policy.allowPaid = true;
    await f.json("company/settings", settings, "PUT");
    for (const slot of ["assistant", "director"])
      await f.setSecret("company_ai_" + slot + "_gemini", {
        key: "fixture-key",
      });
    await f.json(
      "company/connections/odssg_vn",
      {
        kind: "odbc",
        name: "Documents",
        baseUrl: "https://gateway.fixture",
        secret: { key: "fixture-token" },
      },
      "PUT",
    );
    const request = {
      requestId: randomUUID(),
      text: "Export 10-ADU8 from table A to Excel",
      reviewPlan: true,
    };
    const id = (await f.json("company/messages", request)).value.job.id;
    let j = await f.settle(id, "waiting_input");
    assert(j.paused);
    assert.equal(f.state.queries, 0);
    assert.equal(j.steps.length, 2);
    let response = await f.json(
      "company/connections/odssg_vn",
      { revision: 1 },
      "DELETE",
    );
    assert.equal(response.status, 409);
    const plan = {
      title: "Reviewed document export",
      steps: j.steps.map((s) => ({ ...s, title: s.title + " reviewed" })),
    };
    response = await f.json(
      "company/jobs/" + id + "/plan",
      { revision: j.revision, plan },
      "PUT",
    );
    assert.equal(response.status, 200, JSON.stringify(response.value));
    j = response.value.job;
    assert.equal(
      (
        await f.json("company/jobs/" + id + "/control", {
          revision: j.revision - 1,
          action: "resume",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await f.json("company/jobs/" + id + "/control", {
          revision: j.revision,
          action: "resume",
        })
      ).status,
      202,
    );
    j = await f.settle(id, "completed");
    assert.equal(f.state.queries, 1);
    assert(j.result.files.length);
    let recipe = (await f.json("company/workspace")).value.recipes.find(
      (r) => r.id === j.recipeId,
    );
    await f.pool.query(
      "UPDATE company_recipes SET value=jsonb_set(value,'{automation}',jsonb_build_object('enabled',false,'day','2026-11-19','runs',1)) WHERE id=$1",
      [recipe.id],
    );
    const schedule = {
      revision: recipe.revision,
      enabled: true,
      intervalMinutes: 30,
      maxRunsPerDay: 2,
      maxCalls: 2,
    };
    let ar = await f.json(
      "company/recipes/" + recipe.id + "/automation",
      schedule,
      "PUT",
    );
    assert.equal(ar.status, 200);
    recipe = ar.value.recipe;
    assert.equal(recipe.automation.runs, 1);
    const queuedId = randomUUID();
    await f.pool.query(
      "INSERT INTO company_jobs(id,state,value) VALUES($1,$2,$3)",
      [
        queuedId,
        "queued",
        JSON.stringify({
          title: "Scheduled checkpoint",
          recipeId: recipe.id,
          phase: "execute",
          automation: { scope: [] },
          steps: [],
          nextAttemptAt: Date.now() + 3600000,
        }),
      ],
    );
    ar = await f.json(
      "company/recipes/" + recipe.id + "/automation",
      {
        ...schedule,
        revision: recipe.revision,
        enabled: false,
        preserveQueued: true,
      },
      "PUT",
    );
    assert.equal(ar.status, 200);
    let queued = (await f.json("company/jobs/" + queuedId)).value.job;
    assert.equal(queued.state, "queued");
    await f.json("company/jobs/" + queuedId + "/control", {
      revision: queued.revision,
      action: "pause",
    });
    ar = await f.json(
      "company/recipes/" + recipe.id + "/automation",
      { ...schedule, revision: ar.value.recipe.revision },
      "PUT",
    );
    assert.equal(ar.status, 200);
    assert.equal(ar.value.recipe.automation.runs, 1);
    queued = (await f.json("company/jobs/" + queuedId)).value.job;
    assert(queued.paused);
    assert.equal(queued.state, "waiting_input");
    assert.equal(
      (
        await f.json(
          "company/work-history?recipeId=" +
            recipe.id +
            "&active=true&automated=true",
        )
      ).value.jobs.length,
      1,
    );
    await f.json("company/jobs/" + queuedId + "/control", {
      revision: queued.revision,
      action: "stop",
    });
    await f.json(
      "company/recipes/" + recipe.id + "/automation",
      { ...schedule, revision: ar.value.recipe.revision, enabled: false },
      "PUT",
    );
    const hist = await f.json("company/work-history");
    assert(hist.value.jobs.some((v) => v.id === id));
    assert(
      (await f.json("company/messages?jobId=" + id)).value.messages.length > 0,
    );
    assert.equal(
      (await f.json("company/messages", { jobId: id }, "DELETE")).status,
      200,
    );
    assert.equal(
      (await f.json("company/messages?jobId=" + id)).value.messages.length,
      0,
    );
    assert.equal((await f.json("company/messages", request)).value.job.id, id);
    assert.equal(f.state.queries, 1);
    assert.equal(
      (await f.json("company/jobs/" + id)).value.job.result.files.length,
      j.result.files.length,
    );
    assert.equal(
      (await f.json("company/connections/odssg_vn", { revision: 1 }, "DELETE"))
        .status,
      200,
    );
    assert.equal(await f.getSecret("company_odssg_vn"), undefined);
    f.state.owner = false;
    assert.equal((await f.json("company/work-history")).status, 401);
    assert.equal((await f.json("company/messages", {}, "DELETE")).status, 401);
  },
);
test(
  "in-flight pause and stop retain confirmed results and never start the next block",
  enabled,
  async (t) => {
    const f = await companyFixture(process.env.TEST_DATABASE_URL);
    t.after(() => f.close());
    const store = new CompanyStore(f.pool);
    let release,
      started,
      calls = 0;
    const gate = new Promise((r) => (release = r)),
      entered = new Promise((r) => (started = r));
    const runner = new CompanyRunner({
      store,
      model: async () => {
        throw Error("Unexpected model call");
      },
      getSecret: async () => ({ key: "fixture" }),
      tool: async () => {
        calls++;
        started();
        await gate;
        return { rows: [{ actual: 1 }] };
      },
    });
    const id = randomUUID(),
      steps = [1, 2].map((i) => ({
        id: "step-" + i,
        title: "Read " + i,
        skill: "data",
        tool: "query",
        connection: "odssg_vn",
        args: { sql: "SELECT 1" },
        dependsOn: i === 1 ? [] : ["step-1"],
        state: "pending",
      }));
    await f.json(
      "company/connections/odssg_vn",
      {
        kind: "odbc",
        name: "Documents",
        baseUrl: "https://gateway.fixture",
        secret: { key: "fixture-token" },
      },
      "PUT",
    );
    await f.pool.query(
      "INSERT INTO company_jobs(id,state,value) VALUES($1,$2,$3)",
      [
        id,
        "running",
        JSON.stringify({
          phase: "execute",
          title: "Cooperative pause",
          steps,
          calls: 0,
          events: [],
          leaseUntil: Date.now() + 180000,
        }),
      ],
    );
    const job = await store.get(id);
    const work = runner.work(job);
    await entered;
    let r = await f.json("company/jobs/" + id + "/control", {
      revision: (await store.get(id)).revision,
      action: "pause",
    });
    assert.equal(r.status, 202);
    release();
    await work;
    let saved = await store.get(id);
    assert(saved.paused);
    assert.equal(saved.steps[0].state, "completed");
    assert.equal(saved.steps[1].state, "pending");
    assert.equal(calls, 1);
    // Editing an already confirmed result is refused, even while paused.
    const plan = {
      title: saved.title,
      steps: saved.steps.map((s) => ({ ...s, title: "Changed" })),
    };
    assert.equal(
      (
        await f.json(
          "company/jobs/" + id + "/plan",
          { revision: saved.revision, plan },
          "PUT",
        )
      ).status,
      400,
    );
    r = await f.json("company/jobs/" + id + "/control", {
      revision: saved.revision,
      action: "stop",
    });
    assert.equal(r.status, 202);
    saved = await store.get(id);
    assert.equal(saved.state, "cancelled");
    assert.equal(saved.steps[0].result.rows[0].actual, 1);
    assert.equal(calls, 1);
  },
);
