import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeConnection,
  serviceOperation,
  resourcePath,
} from "../server/company-connections.js";
import {
  connectionTypes,
  databaseCredential,
} from "../site/company-connections.js";
import { stepDependencies } from "../site/company-v2-scene.js";
import { createCompanyTools } from "../server/company-v2-tools.js";
test("typed database settings build real driver credentials, keep private fields out of metadata, preserve blank passwords and legacy URIs", () => {
  for (const kind of ["postgres", "mysql", "sqlserver", "oracle"]) {
    const body = {
      name: "Data",
      host: "db.internal",
      port: "5432",
      database: "documents",
      secret: { username: "read user", password: "secret@:/ pass" },
    };
    const first = normalizeConnection(kind, body);
    assert(!JSON.stringify(first.value).includes("secret@"));
    assert(!JSON.stringify(first.value).includes("read user"));
    assert(
      first.secret.connectionString.includes(
        kind === "postgres"
          ? "postgresql:"
          : kind === "mysql"
            ? "mysqls:"
            : '"user"',
      ),
    );
    const edit = normalizeConnection(
      kind,
      { ...body, secret: { password: "" } },
      first.secret,
    );
    assert.equal(edit.secret.connectionString, first.secret.connectionString);
    const legacy = normalizeConnection(
      kind,
      { name: "Legacy", secret: {} },
      { connectionString: first.secret.connectionString },
    );
    assert.equal(legacy.secret.connectionString, first.secret.connectionString);
  }
  assert.throws(
    () =>
      databaseCredential("mysql", {
        host: "http://evil",
        port: "1",
        username: "a",
        database: "b",
      }),
    /hostname/,
  );
  assert.throws(
    () =>
      normalizeConnection("facebook", {
        name: "page",
        accountId: "1234",
        secret: { password: "not-a-token" },
      }),
    /supported secure/,
  );
});
test("network calls use only saved origin/path, authentication and method; health checks do not invoke the write action", async () => {
  const { value: c, secret: s } = normalizeConnection("network", {
    name: "Intranet",
    baseUrl: "https://service.internal",
    requestPath: "/create-report",
    checkPath: "/health",
    method: "POST",
    auth: "basic",
    secret: { username: "owner", key: "fixture-private" },
  });
  assert.equal(c.effect, "write");
  let captured;
  const gateway = (origin, options) => async (url, request) => {
    captured = { origin, options, url: String(url), request };
    return { ok: true };
  };
  await serviceOperation(c, s, { input: { task: "one" } }, { gateway });
  assert.equal(captured.url, "https://service.internal/create-report");
  assert.equal(captured.request.method, "POST");
  assert.equal(
    captured.request.headers.Authorization,
    "Basic " + Buffer.from("owner:fixture-private").toString("base64"),
  );
  assert.deepEqual(JSON.parse(captured.request.body), { task: "one" });
  await serviceOperation(c, s, {}, { gateway, check: true });
  assert.equal(captured.url, "https://service.internal/health");
  assert.equal(captured.request.method, "GET");
  assert.equal(captured.request.body, undefined);
  assert.throws(() => resourcePath("//other.host/x"), /fixed resource/);
  assert.throws(() => resourcePath("/../secret"), /fixed resource/);
});
test("social connections have distinct requirements and actual message receipts; TikTok remains account-read only", async () => {
  assert.notDeepEqual(
    connectionTypes.messenger.fields,
    connectionTypes.whatsapp.fields,
  );
  assert.throws(
    () =>
      normalizeConnection("whatsapp", {
        name: "WA",
        accountId: "12345",
        secret: { key: "fixture" },
      }),
    /Business account/,
  );
  const c = normalizeConnection("whatsapp", {
    name: "WA",
    accountId: "12345",
    businessId: "67890",
    secret: { key: "fixture" },
  });
  let sent;
  const request = async (url, options) => {
    sent = { url, options };
    return { messages: [{ id: "wamid-fixture" }] };
  };
  const r = await serviceOperation(
    c.value,
    c.secret,
    { recipient: "84901234567", template: "hello_world", language: "en_US" },
    { request },
  );
  assert.equal(r.receipt, "wamid-fixture");
  assert.equal(JSON.parse(sent.options.body).template.name, "hello_world");
  assert.match(sent.url, /12345\/messages$/);
  const verify = async (url, options) => {
    assert.equal(options.method, "GET");
    return { id: "12345" };
  };
  await serviceOperation(
    c.value,
    c.secret,
    {},
    { request: verify, check: true },
  );
  await assert.rejects(
    serviceOperation(
      c.value,
      c.secret,
      { recipient: "bad", text: "hi" },
      { request },
    ),
    /recipient/,
  );
  const tool = createCompanyTools({
    getSecret: async () => ({ key: "fixture" }),
    request,
  });
  await assert.rejects(
    tool(
      { tool: "message", connection: "tt", args: {} },
      { connections: [{ id: "tt", kind: "tiktok" }], steps: [] },
    ),
    /matching service/,
  );
});
test("workflow mapped-data rails reflect real explicit dependencies, not invented parallel execution", () => {
  assert.deepEqual(
    stepDependencies({
      args: {
        from: "step-1",
        input: { rows: { $step: "step-3", path: "rows" } },
      },
    }),
    [
      { id: "step-1", path: "from" },
      { id: "step-3", path: "rows" },
    ],
  );
  assert.deepEqual(
    stepDependencies({ args: { input: { toolFrom: "step-2" } } }),
    [{ id: "step-2", path: "toolFrom" }],
  );
});

test("all 39 workflow examples are inactive, topologically valid and cover every actual tool type", async () => {
  const { workflowExamples } = await import("../site/workflow-examples.js");
  const { toolCatalog, validatePlan, defaultCompanySettings } = await import(
    "../site/company-v2-model.js"
  );
  assert.equal(workflowExamples.length, 39);
  const covered = new Set();
  for (const example of workflowExamples) {
    assert.equal(example.draft, true);
    const connections = example.slots.map((s) => ({ id: s.key, kind: s.kind }));
    const valid = validatePlan(
      { title: example.title, steps: example.procedure },
      { connections, skills: defaultCompanySettings().skills },
    );
    for (const step of valid.steps) covered.add(step.tool);
    assert(!example.automation?.enabled);
  }
  for (const tool of Object.keys(toolCatalog))
    assert(covered.has(tool), "No example for " + tool);
});

test("DAG validation rejects forward dependencies, unsafe conditions and preserves structural scopes regardless of JSONB key order", async () => {
  const { flowMetadata, sameFlow } = await import("../site/company-flow.js");
  assert.throws(
    () => flowMetadata({ args: {}, dependsOn: ["step-2"] }, 0),
    /cycles|earlier/,
  );
  assert.throws(
    () =>
      flowMetadata(
        { args: {}, when: { step: "step-0", op: "eval", value: true } },
        1,
      ),
    /prior|earlier|condition/,
  );
  assert(
    sameFlow(
      {
        when: { step: "step-1", path: "value", op: "eq", value: true },
        dependsOn: ["step-1"],
      },
      {
        dependsOn: ["step-1"],
        when: { value: true, op: "eq", path: "value", step: "step-1" },
      },
    ),
  );
});

test("paired ODBC setup uses a device/DSN rather than an invented gateway and keeps database credentials private", () => {
  const body = {
    name: "Oracle on laptop",
    transport: "device",
    deviceId: "00000000-0000-4000-8000-000000000001",
    dsn: "odssg_vn",
    dialect: "oracle",
    auth: "credentials",
    secret: { username: "private-reader", password: "private-password" },
  };
  const r = normalizeConnection("odbc", body);
  assert.equal(r.value.deviceId, body.deviceId);
  assert.equal(r.value.action, "odbc_query");
  assert.equal(r.value.baseUrl, undefined);
  assert.equal(r.value.unattended, false);
  assert(!JSON.stringify(r.value).includes("private-reader"));
  assert(!JSON.stringify(r.value).includes("private-password"));
  assert.equal(r.secret.password, "private-password");
  const edit = normalizeConnection(
    "odbc",
    { ...body, secret: { username: "", password: "" } },
    r.secret,
  );
  assert.equal(edit.secret.password, "private-password");
  assert.throws(
    () => normalizeConnection("odbc", { ...body, dsn: "x;PWD=bad" }),
    /DSN/,
  );
});
