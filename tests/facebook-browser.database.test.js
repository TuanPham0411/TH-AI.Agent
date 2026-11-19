import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { companyFixture } from "./company-v2-fixture.mjs";
import { deviceAgentRouter } from "../server/personal-devices.js";
import { defaultCompanySettings } from "../site/company-v2-model.js";
import { CompanyStore } from "../server/company-v2-store.js";
import { CompanyRunner } from "../server/company-v2-runner.js";
const wait = () => new Promise((r) => setTimeout(r, 50));
test(
  "browser setup/login/check and publication use bound one-time device tasks, exact approval, private media delivery and reject unattended laptop automation",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const f = await companyFixture(process.env.TEST_DATABASE_URL);
    t.after(() => f.close());
    const oldRoot = process.env.FILES_ROOT;
    process.env.FILES_ROOT = f.root;
    t.after(() => {
      if (oldRoot === undefined) delete process.env.FILES_ROOT;
      else process.env.FILES_ROOT = oldRoot;
    });
    const app = express();
    app.use(deviceAgentRouter(f.pool));
    const server = app.listen(0, "127.0.0.1");
    await new Promise((r) => server.once("listening", r));
    t.after(() => new Promise((r) => server.close(r)));
    const origin = "http://127.0.0.1:" + server.address().port;
    const d = (await f.json("company/devices", { name: "Browser laptop" }))
      .value;
    const caps = {
      execution: "desktop",
      unattended: false,
      platform: "Windows",
      actions: [
        { id: "facebook_check", effect: "read", description: "Check" },
        { id: "facebook_login", effect: "write", description: "Login" },
        { id: "facebook_publish", effect: "write", description: "Publish" },
      ],
    };
    const agent = async (route, body, token = d.token) => {
      const r = await fetch(origin + "/api/device-link/" + route, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      return { status: r.status, value: await r.json() };
    };
    const poll = async () => {
      for (let i = 0; i < 60; i++) {
        const r = await agent("poll", { capabilities: caps });
        if (r.value.task) return r.value.task;
        await wait();
      }
      throw Error("No browser task");
    };
    await agent("poll", { capabilities: caps });
    assert.equal(
      (
        await f.json(
          "company/connections/browser",
          {
            kind: "facebook_browser",
            name: "Local Facebook",
            deviceId: d.id,
            pageUrl: "https://www.facebook.com/TestPage",
            expectedName: "Test Page",
            secret: {},
          },
          "PUT",
        )
      ).status,
      200,
    );
    let request = f.json("company/connections/browser/browser-login", {}),
      task = await poll();
    assert.equal(task.action, "facebook_login");
    assert.equal(task.input.pageUrl, "https://www.facebook.com/TestPage");
    assert.equal(task.input.expectedName, "Test Page");
    await agent("tasks/" + task.id + "/result", {
      claim: task.claim,
      ok: true,
      output: { status: "login_opened", message: "Sign in on laptop" },
    });
    assert.equal((await request).status, 200);
    request = f.json("company/connections/browser/check", {});
    task = await poll();
    assert.equal(task.action, "facebook_check");
    await agent("tasks/" + task.id + "/result", {
      claim: task.claim,
      ok: true,
      output: { status: "ready" },
    });
    assert.equal((await request).status, 200);
    const asset = randomUUID();
    await mkdir(path.join(f.root, "fixture"), { recursive: true });
    await writeFile(path.join(f.root, "fixture/image.png"), "fixture-image");
    await f.pool.query(
      "INSERT INTO files(id,path,name,type,size)VALUES($1,$2,$3,$4,$5)",
      [asset, "fixture/image.png", "image.png", "image/png", 13],
    );
    const settings = { ...defaultCompanySettings(), revision: 0 };
    settings.policy.allowPaid = true;
    await f.json("company/settings", settings, "PUT");
    const store = new CompanyStore(f.pool);
    const j = (
      await store.enqueue({
        requestId: randomUUID(),
        text: "Publish on the browser",
      })
    ).job;
    const runner = new CompanyRunner({
      store,
      getSecret: async () => ({ key: "fixture-key" }),
      tool: async () => {
        throw Error("No browser may run before approval");
      },
      model: async (request) => ({
        text: JSON.stringify(
          request.slot === "assistant"
            ? { reply: "Working", dispatch: true, request: "Post" }
            : {
                action: "plan",
                plan: {
                  title: "Browser publication",
                  steps: [
                    {
                      title: "Publish approved content",
                      tool: "publish",
                      skill: "publisher",
                      connection: "browser",
                      args: { caption: "Approved caption", assetId: asset },
                    },
                  ],
                },
              },
        ),
      }),
    });
    await runner.tick();
    let job = await store.get(j.id);
    assert.equal(job.state, "waiting_approval");
    assert.equal(
      (await agent("poll", { capabilities: caps })).value.task,
      null,
    );
    await f.json("company/jobs/" + j.id + "/respond", {
      revision: job.revision,
      action: "approve",
      hash: job.approval.hash,
    });
    task = await poll();
    assert.equal(task.action, "facebook_publish");
    assert.equal(task.input.assetId, asset);
    assert.equal(task.input.profileId, "browser");
    const mediaURL = origin + "/api/device-link/tasks/" + task.id + "/media";
    assert.equal((await fetch(mediaURL)).status, 401);
    const media = await fetch(mediaURL, {
      headers: { Authorization: "Bearer " + d.token },
    });
    assert.equal(media.status, 200);
    assert.equal(await media.text(), "fixture-image");
    await agent("tasks/" + task.id + "/result", {
      claim: task.claim,
      ok: true,
      output: {
        status: "published",
        confirmed: true,
        browserClosed: true,
        url: "https://www.facebook.com/TestPage/posts/123456",
      },
    });
    job = await f.settle(j.id, "completed");
    assert.equal(job.result.receipts[0].transport, "browser");
    assert.equal(
      (
        await fetch(mediaURL, {
          headers: { Authorization: "Bearer " + d.token },
        })
      ).status,
      404,
    );
    const r = (await f.json("company/workspace")).value.recipes.find(
      (r) => r.id === job.recipeId,
    );
    assert.equal(
      (
        await f.json(
          "company/recipes/" + r.id + "/automation",
          {
            revision: r.revision,
            enabled: true,
            intervalMinutes: 30,
            maxRunsPerDay: 2,
            maxCalls: 2,
            allowWrites: true,
          },
          "PUT",
        )
      ).status,
      400,
    );
    assert(
      !JSON.stringify((await f.json("company/workspace")).value).includes(
        d.token,
      ),
    );
  },
);
