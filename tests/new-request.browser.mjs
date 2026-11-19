import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import { companyFixture } from "./company-v2-fixture.mjs";
const f = await companyFixture(process.env.TEST_DATABASE_URL),
  b = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
try {
  const id = randomUUID(),
    title =
      "Earlier task with a long Vietnamese title — Đăng bài viết lên TH-Tuan Pham";
  await f.pool.query(
    "INSERT INTO company_jobs(id,state,value)VALUES($1,$2,$3)",
    [
      id,
      "waiting_input",
      JSON.stringify({
        title,
        phase: "director",
        steps: [],
        question: "Earlier setup required",
      }),
    ],
  );
  await f.pool.query(
    "INSERT INTO company_messages(id,job_id,role,content)VALUES($1,$2,'user','Earlier conversation content')",
    [randomUUID(), id],
  );
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } }),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(f.origin + "/#work/" + id);
  await p.getByText("Earlier conversation content", { exact: true }).waitFor();
  await p
    .getByLabel("Message your assistant", { exact: true })
    .fill("Old unsent draft");
  await p.getByRole("button", { name: "New request", exact: true }).click();
  assert(p.url().endsWith("#new"));
  assert.equal(
    await p.getByLabel("Message your assistant", { exact: true }).inputValue(),
    "",
  );
  assert.equal(
    await p
      .locator(".conversation-log")
      .getByText("Earlier conversation content", { exact: true })
      .count(),
    0,
  );
  assert.equal(await p.locator(".company-flow").count(), 0);
  await p.getByText("No active workflow", { exact: true }).waitFor();
  await p.waitForTimeout(3500);
  assert.equal(await p.locator(".company-flow").count(), 0);
  await p.reload();
  await p.getByText("No active workflow", { exact: true }).waitFor();
  await p.getByRole("button", { name: "Work manager", exact: true }).click();
  await p.getByRole("button", { name: "Chat history", exact: true }).click();
  const row = p.locator(".history-thread");
  await row.waitFor();
  const clear = await p
      .getByRole("button", { name: "Clear all chat history", exact: true })
      .boundingBox(),
    thread = await row.boundingBox(),
    browse = await p
      .getByRole("button", { name: "Browse all tasks", exact: true })
      .boundingBox();
  assert(thread.y >= clear.y + clear.height);
  assert(browse.y >= thread.y + thread.height);
  await p.screenshot({
    path: "artifacts/chat-history-separated-rows.jpg",
    type: "jpeg",
    quality: 90,
  });
  await p.getByRole("button", { name: "Open chat", exact: true }).click();
  await p.getByText("Earlier conversation content", { exact: true }).waitFor();
  await p.getByRole("button", { name: "Close dialog", exact: true }).click();
  await p
    .getByLabel("Message your assistant", { exact: true })
    .fill("A fresh request");
  await p.getByRole("button", { name: "Send", exact: true }).click();
  await p
    .getByRole("button", { name: "Secure AI setup", exact: true })
    .waitFor();
  assert.equal(
    await p
      .locator(".conversation-log")
      .getByText("Earlier conversation content", { exact: true })
      .count(),
    0,
  );
  await p.reload();
  await p
    .getByRole("button", { name: "Secure AI setup", exact: true })
    .waitFor();
  assert.equal(
    await p
      .locator(".conversation-log")
      .getByText("Earlier conversation content", { exact: true })
      .count(),
    0,
  );
  assert.equal(
    (await f.json("company/messages?jobId=" + id)).value.messages.length,
    1,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS New request clears selection/draft/graph/chat, stays blank through polling and reload, isolates the new conversation, retains earlier work, and history rows do not overlap actions. No paid calls.",
  );
} finally {
  await b.close();
  await f.close();
}
