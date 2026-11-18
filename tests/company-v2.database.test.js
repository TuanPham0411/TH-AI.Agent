import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { companyFixture } from "./company-v2-fixture.mjs";
import { defaultCompanySettings } from "../site/company-v2-model.js";
test(
  "two-role company persists clarification, executes a real parameterized query, delivers XLSX, gates publication and deduplicates requests",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const f = await companyFixture(process.env.TEST_DATABASE_URL);
    t.after(() => f.close());
    const settings = { ...defaultCompanySettings(), revision: 0 };
    settings.policy.allowPaid = true;
    assert.equal(
      (await f.json("company/settings", settings, "PUT")).status,
      200,
    );
    assert.equal(
      (await f.json("company/settings", settings, "PUT")).status,
      409,
    );
    await f.setSecret("company_ai_assistant_gemini", {
      key: "fixture-assistant",
    });
    await f.setSecret("company_ai_director_gemini", {
      key: "fixture-director",
    });
    const requestId = randomUUID(),
      request = {
        requestId,
        text: "Get 10-ADU8 from table A of odssg_vn and export Excel.",
      };
    const initial = await f.json("company/messages", request);
    assert.equal(initial.status, 202);
    const id = initial.value.job.id;
    assert.equal((await f.json("company/messages", request)).value.job.id, id);
    let job = await f.settle(id, "waiting_input");
    assert.equal(f.state.queries, 0);
    assert.equal(job.needs.kind, "odbc");
    assert.equal(
      (
        await f.json(
          "company/connections/odssg_vn",
          {
            kind: "odbc",
            name: "odssg_vn",
            baseUrl: "https://gateway.fixture",
            secret: { key: "fixture-gateway-token" },
          },
          "PUT",
        )
      ).status,
      200,
    );
    let snapshot = (await f.json("company/workspace")).value;
    assert(!JSON.stringify(snapshot).includes("fixture-gateway-token"));
    assert(!JSON.stringify(snapshot).includes("fixture-assistant"));
    assert.equal(
      (
        await f.json("company/jobs/" + id + "/respond", {
          revision: job.revision - 1,
          action: "reply",
          text: "Continue",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await f.json("company/jobs/" + id + "/respond", {
          revision: job.revision,
          action: "reply",
          text: "Connected now.",
        })
      ).status,
      202,
    );
    job = await f.settle(id, "completed");
    assert.equal(f.state.queries, 1);
    assert.equal(f.state.calls.filter((c) => c.slot === "assistant").length, 1);
    assert.equal(job.result.files.length, 1);
    const file = (
      await f.pool.query("SELECT * FROM files WHERE id=$1", [
        job.result.files[0].id,
      ])
    ).rows[0];
    const bytes = await readFile(f.root + "/" + file.path);
    assert(bytes.includes(Buffer.from("10-ADU8-001")));
    assert(!bytes.includes(Buffer.from("99-OTHER")));
    assert.equal(
      file.type,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    assert.equal((await fetch(f.origin + job.result.files[0].url)).status, 200);
    const post = await f.json("company/messages", {
      requestId: randomUUID(),
      text: "Post something thoughtful to my Facebook Page.",
    });
    let social = await f.settle(post.value.job.id, "waiting_input");
    await f.json(
      "company/connections/my_page",
      {
        kind: "facebook",
        name: "My Page",
        accountId: "123456",
        secret: { key: "fixture-page-token" },
      },
      "PUT",
    );
    await f.json("company/jobs/" + social.id + "/respond", {
      revision: social.revision,
      action: "reply",
      text: "Page connected.",
    });
    social = await f.settle(social.id, "waiting_approval");
    assert.equal(f.state.writes, 0);
    const approve = {
      revision: social.revision,
      action: "approve",
      hash: social.approval.hash,
    };
    assert.equal(
      (
        await f.json("company/jobs/" + social.id + "/respond", {
          ...approve,
          hash: "tampered",
        })
      ).status,
      409,
    );
    assert.equal(
      (await f.json("company/jobs/" + social.id + "/respond", approve)).status,
      202,
    );
    social = await f.settle(social.id, "completed");
    assert.equal(f.state.writes, 1);
    assert.equal(social.result.receipts[0].receipt, "123456_987654");
    assert.equal(
      (await f.json("company/jobs/" + social.id + "/respond", approve)).status,
      409,
    );
    assert.equal(f.state.writes, 1);
    assert.deepEqual([...new Set(f.state.calls.map((c) => c.slot))].sort(), [
      "assistant",
      "director",
    ]);
    assert(
      f.state.calls.every(
        (c) => !JSON.stringify(c).includes("fixture-page-token"),
      ),
    );
    const idempotentJobs = Number(
      (await f.pool.query("SELECT count(*) FROM company_jobs")).rows[0].count,
    );
    assert.equal(idempotentJobs, 2);
    f.state.owner = false;
    assert.equal((await f.json("company/workspace")).status, 401);
  },
);
test(
  "production cutover refuses old per-person model graphs and suspends old timers before paid execution",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const express = (await import("express")).default,
      { studioRoutes } = await import("../server/studio.js");
    const f = await companyFixture(process.env.TEST_DATABASE_URL);
    t.after(() => f.close());
    const studio = studioRoutes({ pool: f.pool });
    t.after(() => studio.shutdown());
    const app = express();
    app.use(express.json());
    app.use(studio.internal);
    app.use(studio.router);
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    t.after(() => new Promise((r) => server.close(r)));
    const id = randomUUID();
    await f.pool.query(
      "INSERT INTO ai_workflows(id,title,graph) VALUES($1,$2,$3)",
      [
        id,
        "Retained legacy AI graph",
        { nodes: [{ id: "model", type: "model" }], edges: [] },
      ],
    );
    const previous = {
      mode: process.env.NODE_ENV,
      token: process.env.TH_STORAGE_TOKEN,
    };
    process.env.NODE_ENV = "production";
    process.env.TH_STORAGE_TOKEN = "fixture-legacy-timer-token";
    t.after(() => {
      if (previous.mode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous.mode;
      if (previous.token === undefined) delete process.env.TH_STORAGE_TOKEN;
      else process.env.TH_STORAGE_TOKEN = previous.token;
    });
    const response = await fetch(
      "http://127.0.0.1:" +
        server.address().port +
        "/workflows/" +
        id +
        "/runs",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: {}, allowPaid: true }),
      },
    );
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /two-role/);
    const timer = await fetch(
      "http://127.0.0.1:" + server.address().port + "/api/internal/timers/tick",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer fixture-legacy-timer-token",
        },
        body: "{}",
      },
    );
    assert.equal((await timer.json()).legacySuspended, true);
    assert.equal(
      Number(
        (await f.pool.query("SELECT count(*) FROM ai_runs")).rows[0].count,
      ),
      0,
    );
  },
);
