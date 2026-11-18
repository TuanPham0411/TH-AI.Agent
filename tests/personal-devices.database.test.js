import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import https from "node:https";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawn } from "node:child_process";
import { deviceAgentRouter, deviceInvoke } from "../server/personal-devices.js";
import { companyFixture } from "./company-v2-fixture.mjs";
const wait = () => new Promise((r) => setTimeout(r, 50));
test(
  "outbound device authentication is isolated, claims are single-use, revocation prevents actions and tokens never return in workspace",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const f = await companyFixture(process.env.TEST_DATABASE_URL);
    t.after(() => f.close());
    const app = express();
    app.use(deviceAgentRouter(f.pool));
    app.use((_req, res) => res.status(404).end());
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    t.after(() => new Promise((r) => server.close(r)));
    const origin = "http://127.0.0.1:" + server.address().port;
    const created = await f.json("company/devices", { name: "Fixture laptop" });
    assert.equal(created.status, 200);
    const { id, token } = created.value;
    assert.equal(token.length, 43);
    const call = async (route, body, auth = token) => {
      const r = await fetch(origin + "/api/device-link/" + route, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      return { status: r.status, value: await r.json() };
    };
    const caps = {
      execution: "desktop",
      unattended: false,
      platform: "Fixture",
      fullControl: true,
      actions: [
        { id: "execute", effect: "write", description: "Fixture execution" },
      ],
    };
    assert.equal(
      (await call("poll", { capabilities: caps }, "bad")).status,
      401,
    );
    assert.equal((await call("poll", { capabilities: caps })).value.task, null);
    const invocation = deviceInvoke(
      f.pool,
      id,
      "execute",
      { x: 2 },
      { signal: AbortSignal.timeout(5000), expectedEffect: "write" },
    );
    await wait();
    let task;
    for (let i = 0; i < 20 && !task; i++) {
      task = (await call("poll", { capabilities: caps })).value.task;
      if (!task) await wait();
    }
    assert(task);
    assert.equal((await call("poll", { capabilities: caps })).value.task, null);
    const data = {
      claim: task.claim,
      ok: true,
      output: { result: { answer: 4 }, confirmed: true },
    };
    assert.equal(
      (await call("tasks/" + task.id + "/result", { ...data, claim: "wrong" }))
        .status,
      409,
    );
    assert.equal(
      (await call("tasks/" + task.id + "/result", data)).status,
      200,
    );
    assert.equal((await invocation).output.result.answer, 4);
    assert.equal(
      (await call("tasks/" + task.id + "/result", data)).status,
      409,
    );
    const list = (await f.json("company/devices")).value;
    assert(!JSON.stringify(list).includes(token));
    assert.equal(list.devices[0].online, true);
    await assert.rejects(
      deviceInvoke(f.pool, id, "execute", {}, { expectedEffect: "read" }),
      /permissions changed/,
    );
    const second = await f.json("company/devices", { name: "Another laptop" });
    await f.json("company/devices/" + id + "/revoke", {});
    assert.equal((await call("poll", { capabilities: caps })).status, 401);
    await assert.rejects(deviceInvoke(f.pool, id, "execute", {}), /offline/);
    assert.equal(
      (
        await fetch(origin + "/api/company/workspace", {
          headers: { Authorization: "Bearer " + second.value.token },
        })
      ).status,
      404,
    );
  },
);
test(
  "real Python outbound agent uses verified TLS, executes only a locally granted action, and returns actual file results",
  { skip: !process.env.TEST_DATABASE_URL, timeout: 30000 },
  async (t) => {
    const f = await companyFixture(process.env.TEST_DATABASE_URL);
    t.after(() => f.close());
    const dir = await mkdtemp(path.join(os.tmpdir(), "th-device-e2e-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "1",
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=DNS:localhost",
        "-keyout",
        path.join(dir, "key.pem"),
        "-out",
        path.join(dir, "cert.pem"),
      ],
      { stdio: "ignore" },
    );
    const app = express();
    app.use(deviceAgentRouter(f.pool));
    const server = https
      .createServer(
        {
          key: await readFile(path.join(dir, "key.pem")),
          cert: await readFile(path.join(dir, "cert.pem")),
        },
        app,
      )
      .listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    t.after(() => new Promise((r) => server.close(r)));
    const origin = "https://localhost:" + server.address().port,
      created = (await f.json("company/devices", { name: "Actual test agent" }))
        .value;
    await writeFile(
      path.join(dir, "device.json"),
      JSON.stringify({
        server: origin,
        token: created.token,
        execution: "desktop",
        fullControl: true,
        roots: { home: dir },
        actions: {},
      }),
    );
    const child = spawn(
      "python3",
      ["tools/personal-device.py", "--config", path.join(dir, "device.json")],
      {
        env: {
          ...process.env,
          SSL_CERT_FILE: path.join(dir, "cert.pem"),
          NO_PROXY: "localhost,127.0.0.1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (v) => (output += v));
    child.stderr.on("data", (v) => (output += v));
    t.after(() => {
      child.kill();
    });
    let online = false;
    for (let i = 0; i < 100; i++) {
      online = (await f.json("company/devices")).value.devices[0].online;
      if (online) break;
      await wait();
    }
    assert(online, output);
    const filename = path.join(dir, "actual-result.txt");
    const response = await deviceInvoke(
      f.pool,
      created.id,
      "execute",
      {
        runtime: "python",
        cwd: dir,
        input: { path: filename, text: "Actual output" },
        code: 'import json,sys,pathlib\nx=json.load(sys.stdin)\npathlib.Path(x["path"]).write_text(x["text"])\nprint(json.dumps({"path":x["path"],"confirmed":True}))',
      },
      { signal: AbortSignal.timeout(15000), expectedEffect: "write" },
    );
    assert.equal(response.output.result.confirmed, true);
    assert.equal(await readFile(filename, "utf8"), "Actual output");
    assert.equal(
      (await f.json("company/devices")).value.devices[0].capabilities.execution,
      "desktop",
    );
    child.kill();
    await new Promise((r) => child.once("exit", r));
  },
);
