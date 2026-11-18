import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import express from "express";
import pg from "pg";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mountCompanyV2 } from "../server/company-v2.js";
import { createCompanyTools } from "../server/company-v2-tools.js";
export async function companyFixture(databaseURL) {
  const admin = new pg.Client({ connectionString: databaseURL });
  await admin.connect();
  const database = "company_fixture_" + randomUUID().replaceAll("-", "");
  await admin.query("CREATE DATABASE " + database);
  const isolated = new URL(databaseURL);
  isolated.pathname = "/" + database;
  execFileSync(process.execPath, ["server/migrate.js"], {
    env: { ...process.env, DATABASE_URL: isolated.href },
  });
  const pool = new pg.Pool({ connectionString: isolated.href, max: 4 }),
    root = await mkdtemp(path.join(os.tmpdir(), "th-company-fixture-"));
  await pool.query(
    "TRUNCATE company_messages,company_jobs,company_recipes,company_connections,company_settings CASCADE",
  );
  await pool.query(
    "CREATE TABLE IF NOT EXISTS company_fixture_documents(code text,title text)",
  );
  await pool.query("TRUNCATE company_fixture_documents");
  await pool.query(
    "INSERT INTO company_fixture_documents VALUES('10-ADU8-001','Tài liệu tiếng Việt'),('99-OTHER','Unrelated')",
  );
  const state = {
    calls: [],
    writes: 0,
    queries: 0,
    owner: true,
    publishUncertain: false,
    slow: false,
    modelsInFlight: 0,
    peakModels: 0,
  };
  const getSecret = async (id) =>
    (await pool.query("SELECT secret FROM ai_credentials WHERE id=$1", [id]))
      .rows[0]?.secret;
  const setSecret = async (id, value) =>
    pool.query(
      "INSERT INTO ai_credentials(id,secret) VALUES($1,$2) ON CONFLICT(id) DO UPDATE SET secret=excluded.secret",
      [id, JSON.stringify(value)],
    );
  const model = async (request) => {
    state.calls.push(request);
    const input = JSON.parse(request.messages[0].text);
    if (state.slow) {
      state.modelsInFlight++;
      state.peakModels = Math.max(state.peakModels, state.modelsInFlight);
      await new Promise((r) => setTimeout(r, 250));
      state.modelsInFlight--;
    }
    if (request.slot === "assistant")
      return {
        text: JSON.stringify({
          reply: "I will take care of this and bring the result back here.",
          dispatch: true,
          request: input.request,
        }),
      };
    const social = /facebook|post/i.test(input.request),
      kind = social ? "facebook" : "odbc",
      connection = input.connections.find((c) => c.kind === kind);
    if (!connection)
      return {
        text: JSON.stringify({
          action: "ask",
          message: social
            ? "Your Facebook Page is not connected. Open the secure connection card and provide a Page ID and Page access token."
            : "odssg_vn is not configured. Connect its read-only ODBC gateway securely, then I can continue with the same request.",
          connectionKind: kind,
          connectionName: social ? "My Facebook Page" : "odssg_vn",
        }),
      };
    return {
      text: JSON.stringify({
        action: "plan",
        message: social
          ? "The caption is ready. I will ask you to approve the exact publication."
          : "I will filter the actual rows, then create a real Excel file.",
        plan: {
          title: social
            ? "A thoughtful Facebook post"
            : "10-ADU8 / Document export",
          steps: social
            ? [
                {
                  title: "Publish thoughtful caption",
                  skill: "publisher",
                  tool: "publish",
                  connection: connection.id,
                  args: {
                    caption:
                      "Some days call for a slower pace. A small breath, a little kindness, and one step at a time.",
                  },
                },
              ]
            : [
                {
                  title: "Filter 10-ADU8 records",
                  skill: "data",
                  tool: "query",
                  connection: connection.id,
                  args: {
                    query:
                      "SELECT code,title FROM company_fixture_documents WHERE code LIKE $1",
                    parameters: ["%10-ADU8%"],
                    limit: 200,
                  },
                },
                {
                  title: "Export matching documents",
                  skill: "data",
                  tool: "export",
                  args: {
                    from: "step-1",
                    format: "xlsx",
                    name: "documents-10-ADU8",
                  },
                },
              ],
        },
      }),
    };
  };
  const request = async (url, options) => {
    if (String(url).startsWith("https://graph.facebook.com/")) {
      if (options.headers.Authorization !== "Bearer fixture-page-token")
        throw Error("Bad fixture token");
      state.writes++;
      if (state.publishUncertain)
        throw Error("Network disconnected after submission");
      return { id: "123456_987654" };
    }
    throw Error("Unexpected external request in fixture");
  };
  const gateway = () => async (url, options) => {
    state.queries++;
    const input = JSON.parse(options.body);
    if (!input.readOnly) throw Error("Gateway must request read-only");
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      const result = await client.query({
        text: input.query,
        values: input.parameters,
        queryMode: "extended",
      });
      await client.query("ROLLBACK");
      return { readOnly: true, rows: result.rows };
    } finally {
      client.release();
    }
  };
  const tools = createCompanyTools({ pool, getSecret, request, gateway, root });
  const app = express();
  app.use(express.json());
  app.get("/api/auth/session", (_req, res) =>
    res.json({ authenticated: state.owner, email: "owner@fixture.test" }),
  );
  const router = express.Router(),
    route = (fn) => (req, res) =>
      Promise.resolve(fn(req, res)).catch((e) =>
        res.status(e.status || 400).json({ error: e.message }),
      );
  const company = mountCompanyV2(router, {
    pool,
    route,
    getSecret,
    setSecret,
    model,
    tool: tools,
    background: false,
  });
  app.use(
    "/api",
    (req, res, next) =>
      state.owner
        ? next()
        : res.status(401).json({ error: "Owner sign-in required" }),
    router,
  );
  app.get("/api/studio/files/:id", async (req, res) => {
    const file = (
      await pool.query("SELECT * FROM files WHERE id=$1", [req.params.id])
    ).rows[0];
    if (!file) return res.status(404).end();
    res.type(file.type).download(path.join(root, file.path), file.name);
  });
  app.use(express.static(path.resolve("dist/web")));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const origin = "http://127.0.0.1:" + server.address().port;
  const json = async (route, body, method = body ? "POST" : "GET") => {
    const response = await fetch(origin + "/api/" + route, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, value: await response.json() };
  };
  const settle = async (id, wanted) => {
    for (let i = 0; i < 100; i++) {
      await company.tick();
      const result = await json("company/workspace"),
        job = result.value.jobs.find((j) => j.id === id);
      if (
        job &&
        (wanted
          ? job.state === wanted
          : !["running", "queued"].includes(job.state))
      )
        return job;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw Error("Fixture did not settle");
  };
  return {
    pool,
    state,
    root,
    company,
    origin,
    json,
    settle,
    getSecret,
    setSecret,
    close: async () => {
      await company.stop();
      await new Promise((r) => server.close(r));
      await pool.query("DELETE FROM ai_credentials WHERE id LIKE 'company_%'");
      await pool.end();
      await admin.query("DROP DATABASE " + database);
      await admin.end();
      await rm(root, { recursive: true, force: true });
    },
  };
}
