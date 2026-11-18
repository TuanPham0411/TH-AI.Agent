import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CompanyRunner } from "../server/company-v2-runner.js";
import {
  defaultCompanySettings,
  validatePlan,
  validateSettings,
} from "../site/company-v2-model.js";
import {
  payloadHash,
  resolveToolStep,
  createCompanyTools,
} from "../server/company-v2-tools.js";
import { exportRows } from "../server/company-v2-xlsx.js";
class MemoryStore {
  constructor() {
    this.config = defaultCompanySettings();
    this.config.policy.allowPaid = true;
    this.connectionsList = [];
    this.jobMap = new Map();
    this.log = [];
    this.recipeList = [];
  }
  async settings() {
    return structuredClone(this.config);
  }
  async connections() {
    return structuredClone(this.connectionsList);
  }
  async messages() {
    return [];
  }
  async recipes() {
    return this.recipeList;
  }
  async recover() {}
  async tx(fn) {
    return fn({ query: async () => ({ rows: [], rowCount: 1 }) });
  }
  async say(job, text) {
    this.log.push({ id: job.id, text });
  }
  async save(job) {
    const old = this.jobMap.get(job.id);
    if (old && old.revision !== job.revision) throw Error("revision conflict");
    job.revision++;
    this.jobMap.set(job.id, structuredClone(job));
    return job;
  }
  async get(id) {
    return structuredClone(this.jobMap.get(id));
  }
  async claim() {
    const job = [...this.jobMap.values()].find((j) => j.state === "queued");
    if (!job) return null;
    const copy = structuredClone(job);
    copy.state = "running";
    await this.save(copy);
    return copy;
  }
  add() {
    const job = {
      id: randomUUID(),
      revision: 1,
      state: "queued",
      phase: "assistant",
      request: "Get the requested documents and return Excel.",
      calls: 0,
      steps: [],
      events: [],
    };
    this.jobMap.set(job.id, job);
    return job.id;
  }
}
const response = (v) => ({
  text: JSON.stringify(v),
  usage: { inputTokens: 3, outputTokens: 5 },
});
const queryPlan = {
  action: "plan",
  plan: {
    title: "Requested records",
    steps: [
      {
        title: "Read matching rows",
        skill: "data",
        tool: "query",
        connection: "odssg_vn",
        args: {
          query: "SELECT * FROM A WHERE document_code LIKE ?",
          parameters: ["%10-ADU8%"],
        },
      },
      {
        title: "Create Excel file",
        skill: "data",
        tool: "export",
        args: { from: "step-1", format: "xlsx" },
      },
    ],
  },
};
test("only Assistant and Director call models; skills execute as tools, confirmed query rows feed export", async () => {
  const store = new MemoryStore();
  store.connectionsList = [{ id: "odssg_vn", kind: "odbc" }];
  const id = store.add(),
    calls = [],
    tools = [];
  const runner = new CompanyRunner({
    store,
    getSecret: async () => ({ key: "fixture" }),
    model: async (request) => {
      calls.push(request);
      return response(
        request.slot === "assistant"
          ? {
              reply: "I will get the records.",
              dispatch: true,
              request: "Find 10-ADU8 and export Excel.",
            }
          : queryPlan,
      );
    },
    tool: async (step, ctx) => {
      tools.push(step.tool);
      if (step.tool === "query")
        return { rows: [{ document_code: "10-ADU8" }], readOnly: true };
      assert.equal(ctx.steps[0].result.rows[0].document_code, "10-ADU8");
      return { files: [{ id: "file", name: "records.xlsx" }] };
    },
  });
  await runner.tick();
  const job = await store.get(id);
  assert.equal(job.state, "completed");
  assert.deepEqual(
    calls.map((c) => c.slot),
    ["assistant", "director"],
  );
  assert.deepEqual(tools, ["query", "export"]);
  assert.equal(job.result.files[0].name, "records.xlsx");
  assert(calls.every((c) => c.tools.length === 0));
});
test("missing AI access pauses in the same conversation without billable calls or tools", async () => {
  const store = new MemoryStore(),
    id = store.add();
  let calls = 0;
  const runner = new CompanyRunner({
    store,
    getSecret: async () => null,
    model: async () => {
      calls++;
    },
    tool: async () => {
      throw Error("Must not execute");
    },
  });
  await runner.tick();
  const job = await store.get(id);
  assert.equal(job.state, "waiting_input");
  assert.equal(job.phase, "assistant");
  assert.equal(job.needs.kind, "ai");
  assert.equal(calls, 0);
  assert(store.log[0].text.includes("secure setup"));
});
test("exact publication waits for approval and resumes without rerunning either model", async () => {
  const store = new MemoryStore();
  store.connectionsList = [
    { id: "my_page", name: "My Page", kind: "facebook", revision: 1 },
  ];
  const id = store.add();
  let count = 0,
    published = 0;
  const runner = new CompanyRunner({
    store,
    getSecret: async () => ({ key: "fixture" }),
    model: async (request) => {
      count++;
      return response(
        request.slot === "assistant"
          ? {
              reply: "I will draft a post.",
              dispatch: true,
              request: "Post to my Page.",
            }
          : {
              action: "plan",
              plan: {
                title: "Thoughtful post",
                steps: [
                  {
                    title: "Publish the finished post",
                    skill: "publisher",
                    tool: "publish",
                    connection: "my_page",
                    args: { caption: "A little kindness goes a long way." },
                  },
                ],
              },
            },
      );
    },
    tool: async () => {
      published++;
      return {
        receipt: "page_post",
        url: "https://www.facebook.com/page_post",
      };
    },
  });
  await runner.tick();
  let job = await store.get(id);
  assert.equal(job.state, "waiting_approval");
  assert.equal(published, 0);
  assert.equal(
    job.approval.hash,
    payloadHash(job.steps[0], store.connectionsList[0]),
  );
  job.steps[0].approvedHash = job.approval.hash;
  job.state = "queued";
  await store.save(job);
  await runner.tick();
  job = await store.get(id);
  assert.equal(job.state, "completed");
  assert.equal(published, 1);
  assert.equal(count, 2);
  assert.equal(job.result.receipts[0].receipt, "page_post");
});
test("unknown publication outcome is never replayed by queue ticks", async () => {
  const store = new MemoryStore();
  store.connectionsList = [
    { id: "page", kind: "facebook", allowPublish: true },
  ];
  const id = store.add();
  let writes = 0;
  const runner = new CompanyRunner({
    store,
    getSecret: async () => ({ key: "fixture" }),
    model: async (r) =>
      response(
        r.slot === "assistant"
          ? { reply: "Working.", dispatch: true }
          : {
              action: "plan",
              plan: {
                title: "Publish",
                steps: [
                  {
                    title: "Post",
                    skill: "publisher",
                    tool: "publish",
                    connection: "page",
                    args: { caption: "Hello" },
                  },
                ],
              },
            },
      ),
    tool: async () => {
      writes++;
      throw Object.assign(Error("Unknown external outcome."), {
        uncertain: true,
      });
    },
  });
  await runner.tick();
  await runner.tick();
  assert.equal((await store.get(id)).state, "uncertain");
  assert.equal(writes, 1);
});
test("asynchronous visual generation resumes the saved job without duplicate charges and only publishes real generated media", async () => {
  const store = new MemoryStore();
  store.connectionsList = [
    { id: "visuals", kind: "media", allowMedia: true },
    { id: "page", kind: "facebook", allowPublish: true },
  ];
  const id = store.add();
  let submits = 0,
    polls = 0,
    writes = 0;
  const runner = new CompanyRunner({
    store,
    getSecret: async () => ({ key: "fixture" }),
    model: async (r) =>
      response(
        r.slot === "assistant"
          ? { reply: "Working.", dispatch: true }
          : {
              action: "plan",
              plan: {
                title: "Illustrated post",
                steps: [
                  {
                    title: "Generate original visual",
                    skill: "editor",
                    tool: "media",
                    connection: "visuals",
                    args: { prompt: "A gentle forest" },
                  },
                  {
                    title: "Publish illustrated caption",
                    skill: "publisher",
                    tool: "publish",
                    connection: "page",
                    args: { caption: "Breathe slowly.", mediaFrom: "step-1" },
                  },
                ],
              },
            },
      ),
    tool: async (step) => {
      if (step.tool === "media") {
        if (!step.result?.jobId) {
          submits++;
          return { pending: true, jobId: "real-job" };
        }
        polls++;
        return {
          jobId: "real-job",
          mediaUrls: ["https://example.com/confirmed-image.png"],
          mediaType: "text_to_image",
        };
      }
      writes++;
      assert.equal(
        step.args.imageUrl,
        "https://example.com/confirmed-image.png",
      );
      return { receipt: "confirmed" };
    },
  });
  await runner.tick();
  let job = await store.get(id);
  assert.equal(job.state, "queued");
  assert.equal(job.steps[0].state, "waiting_external");
  await runner.tick();
  job = await store.get(id);
  assert.equal(job.state, "completed");
  assert.equal(submits, 1);
  assert.equal(polls, 1);
  assert.equal(writes, 1);
});
test("plan and settings cannot create extra model-bearing staff or unregistered tools", () => {
  const settings = defaultCompanySettings();
  assert.equal(
    Object.keys(settings).filter((k) => ["assistant", "director"].includes(k))
      .length,
    2,
  );
  assert.throws(() =>
    validatePlan(
      {
        title: "bad",
        steps: [
          {
            skill: "data",
            title: "Run arbitrary code",
            tool: "shell",
            args: {},
          },
        ],
      },
      { connections: [], skills: settings.skills },
    ),
  );
  assert.throws(() =>
    validateSettings({
      ...settings,
      policy: { allowPaid: true, maxCalls: 99 },
    }),
  );
  assert.throws(() => resolveToolStep({ args: { mediaFrom: "missing" } }, []));
});
test("Excel contains real typed rows and treats formula-like values as text; CSV neutralizes formulas", () => {
  const rows = [
      {
        code: "10-ADU8",
        count: 3,
        note: '=HYPERLINK("https://bad")',
        name: "Tiếng Việt & <tag>",
      },
    ],
    file = exportRows(rows),
    bytes = Buffer.from(file.content, "base64");
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  assert(bytes.includes(Buffer.from("xl/worksheets/sheet1.xml")));
  assert(bytes.includes(Buffer.from("10-ADU8")));
  assert(bytes.includes(Buffer.from("Tiếng Việt &amp; &lt;tag&gt;")));
  assert(!bytes.includes(Buffer.from("<f>")));
  assert(exportRows(rows, "csv").content.includes("'=HYPERLINK"));
  assert.throws(() => exportRows(new Array(201).fill({ a: 1 })));
});
test("worker shutdown waits for the active model, checkpoints the plan and starts no external action", async () => {
  const store = new MemoryStore();
  store.connectionsList = [{ id: "odssg_vn", kind: "odbc" }];
  const id = store.add();
  let release, started;
  const held = new Promise((r) => (release = r)),
    ready = new Promise((r) => (started = r));
  let tools = 0;
  const runner = new CompanyRunner({
    store,
    getSecret: async () => ({ key: "fixture" }),
    model: async (request) => {
      if (request.slot === "assistant")
        return response({ reply: "Working.", dispatch: true });
      started();
      await held;
      return response(queryPlan);
    },
    tool: async () => {
      tools++;
      return {};
    },
  });
  const working = runner.tick();
  await ready;
  const stopping = runner.stop();
  release();
  await Promise.all([working, stopping]);
  const job = await store.get(id);
  assert.equal(job.state, "queued");
  assert.equal(tools, 0);
  assert.equal(job.phase, "execute");
  assert.equal(job.steps.length, 2);
});
test("a plan that misses an explicitly requested publication cannot be reported as delivered", async () => {
  const store = new MemoryStore(),
    id = store.add();
  const runner = new CompanyRunner({
    store,
    getSecret: async () => ({ key: "fixture" }),
    model: async (request) =>
      response(
        request.slot === "assistant"
          ? { reply: "Working.", dispatch: true, expectations: ["publish"] }
          : {
              action: "plan",
              plan: {
                title: "Posted to Facebook",
                steps: [
                  {
                    title: "Draft only",
                    skill: "editor",
                    tool: "report",
                    args: { text: "Draft" },
                  },
                ],
              },
            },
      ),
    tool: async () => ({ files: [{ name: "draft.md" }] }),
  });
  await runner.tick();
  const job = await store.get(id);
  assert.equal(job.state, "waiting_input");
  assert.equal(job.budgetUsed, true);
  assert.notEqual(job.phase, "delivered");
  assert(
    !store.log.some((m) => m.text.includes("Publication receipt received")),
  );
});
test("unattended approval cannot be expanded into repeated publications by a fresh Director plan", async () => {
  const store = new MemoryStore();
  store.connectionsList = [{ id: "page", kind: "facebook", revision: 1 }];
  const id = store.add();
  const seeded = store.jobMap.get(id);
  seeded.phase = "director";
  seeded.automation = {
    scope: [{ tool: "publish", connection: "page", connectionRevision: 1 }],
    allowWrites: true,
    maxCalls: 4,
  };
  let writes = 0;
  const step = {
    title: "Post once",
    skill: "publisher",
    tool: "publish",
    connection: "page",
    args: { caption: "Hello" },
  };
  const runner = new CompanyRunner({
    store,
    getSecret: async () => ({ key: "fixture" }),
    model: async () =>
      response({
        action: "plan",
        plan: { title: "Duplicate post attempt", steps: [step, step] },
      }),
    tool: async () => {
      writes++;
      return { receipt: "not allowed" };
    },
  });
  await runner.tick();
  assert.equal(writes, 0);
  assert.equal((await store.get(id)).state, "waiting_input");
});

test("a personal write tool with a lost response is uncertain while a read tool can request correction", async () => {
  const tool = createCompanyTools({
    pool: {},
    getSecret: async () => ({ key: "fixture", baseUrl: "https://fixture" }),
    gateway: () => async () => {
      throw Error("connection lost");
    },
  });
  const step = { tool: "bridge", connection: "desktop", args: { input: {} } },
    connections = [
      { id: "desktop", kind: "bridge", action: "report", effect: "write" },
    ];
  await assert.rejects(
    tool(step, { connections, steps: [] }),
    (e) => e.uncertain === true,
  );
  connections[0].effect = "read";
  await assert.rejects(
    tool(step, { connections, steps: [] }),
    (e) => !e.uncertain,
  );
});

test("both model roles receive actual tool location/capabilities without gateway secrets", async () => {
  const store = new MemoryStore();
  store.connectionsList = [
    {
      id: "laptop",
      kind: "bridge",
      name: "Tool host",
      execution: "desktop",
      unattended: false,
      verifiedAt: "2026-11-18T00:00:00Z",
      baseUrl: "https://private-tool-host",
      action: "inspect_python",
    },
    {
      id: "worker",
      kind: "bridge",
      name: "Worker",
      execution: "server",
      unattended: true,
      verifiedAt: "2026-11-18T00:00:00Z",
      pythonImageReady: true,
      action: "run_python_tool",
    },
  ];
  const id = store.add(),
    calls = [];
  const runner = new CompanyRunner({
    store,
    getSecret: async () => ({ key: "not-for-context" }),
    model: async (data) => {
      calls.push(JSON.parse(data.messages[0].text));
      return response(
        data.slot === "assistant"
          ? { reply: "I will assess the tool location.", dispatch: true }
          : { action: "ask", message: "Choose the Python project folder." },
      );
    },
    tool: async () => {
      throw Error("No local execution allowed during planning.");
    },
  });
  await runner.tick();
  for (const context of calls) {
    assert.equal(
      context.connections.find((c) => c.id === "laptop").execution,
      "desktop",
    );
    assert.equal(
      context.connections.find((c) => c.id === "laptop").unattended,
      false,
    );
    assert.equal(
      context.connections.find((c) => c.id === "worker").execution,
      "server",
    );
    assert(!JSON.stringify(context).includes("private-tool-host"));
    assert(!JSON.stringify(context).includes("not-for-context"));
  }
  assert.equal(
    calls[1].connections.find((c) => c.id === "worker").pythonImageReady,
    true,
  );
  assert.equal((await store.get(id)).state, "waiting_input");
});
