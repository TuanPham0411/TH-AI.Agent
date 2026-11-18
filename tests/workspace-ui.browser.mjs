import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import { companyFixture } from "./company-v2-fixture.mjs";
const f = await companyFixture(process.env.TEST_DATABASE_URL),
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
try {
  const page = await browser.newPage({
      viewport: { width: 1366, height: 768 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(f.origin);
  await page.getByRole("heading", { name: "Assistant", exact: true }).waitFor();
  assert.equal(
    await page.locator(".desk-footer,.starter-requests,.two-minds").count(),
    0,
  );
  assert.equal(
    await page.getByText("Consider it handled.", { exact: true }).count(),
    0,
  );
  assert.equal(await page.locator(".flow-toolbar").isVisible(), false);
  assert.equal(await page.locator(".work-insight").count(), 0);
  assert.equal(await page.locator(".company-flow").count(), 0);
  assert((await page.locator(".desk-header").boundingBox()).height <= 56);
  assert((await page.locator(".assistant-heading").boundingBox()).height <= 48);
  assert((await page.locator(".work-canvas").boundingBox()).height > 600);
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Workflows", exact: true })
    .waitFor();
  await page
    .getByLabel("Search workflows", { exact: true })
    .fill("Parallel databases");
  assert.equal(await page.locator(".example-card").count(), 1);
  await page
    .getByRole("button", { name: "Preview workflow", exact: true })
    .click();
  await page.locator(".flow-step").first().waitFor();
  assert.equal(await page.locator(".flow-step").count(), 4);
  assert.equal(await page.locator(".work-insight").count(), 0);
  assert((await page.locator(".work-canvas").boundingBox()).height > 540);
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "artifacts/operational-workspace-laptop.jpg",
    type: "jpeg",
    quality: 90,
  });
  const separator = page.getByRole("separator", {
    name: "Resize assistant panel",
    exact: true,
  });
  const before = await page
    .locator(".assistant-desk")
    .evaluate((e) => e.getBoundingClientRect().width);
  await separator.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const wider = await page
    .locator(".assistant-desk")
    .evaluate((e) => e.getBoundingClientRect().width);
  assert(wider >= before + 39);
  await page.getByRole("button", { name: "Auto", exact: true }).click();
  assert(
    Math.abs(
      (await page
        .locator(".assistant-desk")
        .evaluate((e) => e.getBoundingClientRect().width)) - wider,
    ) < 2,
  );
  // A polling update during a drag must not destroy the captured separator or discard the update.
  const box = await page
    .getByRole("separator", { name: "Resize assistant panel", exact: true })
    .boundingBox();
  await page.mouse.move(box.x + 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 42, box.y + box.height / 2);
  await f.pool.query(
    "INSERT INTO company_messages(id,role,content) VALUES($1,'assistant',$2)",
    [randomUUID(), "Resizing keeps updates safe."],
  );
  const refreshed = page.waitForResponse((r) =>
    r.url().endsWith("/api/company/workspace"),
  );
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await refreshed;
  await page.mouse.up();
  await page
    .getByText("Resizing keeps updates safe.", { exact: true })
    .waitFor();
  assert.equal(await page.locator("html.resize-columns").count(), 0);
  assert(
    await page
      .getByRole("separator", { name: "Resize assistant panel", exact: true })
      .getAttribute("aria-valuenow"),
  );
  await page.locator(".flow-step").first().click();
  await page.getByLabel("Workflow details", { exact: true }).waitFor();
  assert.equal(
    await page
      .locator(".inspector-tabs button[aria-pressed=true]")
      .textContent(),
    "Input",
  );
  await page
    .locator(".inspector-tabs")
    .getByRole("button", { name: "Output", exact: true })
    .click();
  await page.getByText(/No output yet/).waitFor();
  const details = page.getByRole("separator", {
    name: "Resize details panel",
    exact: true,
  });
  const initialHeight = await page
    .locator(".work-insight")
    .evaluate((e) => e.getBoundingClientRect().height);
  await details.focus();
  await page.keyboard.press("ArrowUp");
  assert(
    (await page
      .locator(".work-insight")
      .evaluate((e) => e.getBoundingClientRect().height)) > initialHeight,
  );
  await page
    .locator(".inspector-tabs")
    .getByRole("button", { name: "Activity", exact: true })
    .click();
  await page
    .getByText("Preview only. No tools have run.", { exact: true })
    .waitFor();
  await page
    .locator(".inspector-tabs")
    .getByRole("button", { name: "Results", exact: true })
    .click();
  await page.getByText("No results yet.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Close details", exact: true })
    .click();
  assert.equal(await page.locator(".work-insight").count(), 0);
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("button", { name: "Connect tool", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("heading", { name: "Connections", exact: true })
    .waitFor();
  const modal = page.getByRole("dialog");
  await modal.evaluate((e) =>
    Promise.all(e.getAnimations().map((a) => a.finished.catch(() => {}))),
  );
  const modalHeader = await modal.locator(":scope > header").boundingBox(),
    body = await modal.locator(".setup-content").boundingBox();
  assert(body.y >= modalHeader.y + modalHeader.height - 1);
  assert(
    await modal
      .locator(".setup-content")
      .evaluate((e) => e.scrollHeight > e.clientHeight),
  );
  await modal
    .locator(".setup-content")
    .evaluate((e) => (e.scrollTop = e.scrollHeight));
  const stableHeader = await modal.locator(":scope > header").boundingBox();
  assert(Math.abs(modalHeader.y - stableHeader.y) < 1);
  await page.waitForTimeout(220);
  await page.screenshot({
    path: "artifacts/operational-connections-dialog.jpg",
    type: "jpeg",
    quality: 90,
  });
  await page.keyboard.press("Escape");
  assert.equal(await modal.isVisible(), false);
  await page.getByRole("button", { name: "Connect tool", exact: true }).click();
  await page.getByRole("button", { name: /DB PostgreSQL/ }).click();
  await page
    .getByRole("button", { name: "Save secure connection", exact: true })
    .click();
  await modal
    .getByRole("alert")
    .getByText("Enter a connection ID starting with a letter.", { exact: true })
    .waitFor();
  const saveBox = await page
      .getByRole("button", { name: "Save secure connection", exact: true })
      .boundingBox(),
    dialogBox = await modal.boundingBox();
  assert(saveBox.y + saveBox.height < dialogBox.y + dialogBox.height);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("assistant model", { exact: true }).waitFor();
  assert(await page.getByLabel("director model", { exact: true }).isVisible());
  const settingsSave = await page
      .getByRole("button", { name: "Save company setup", exact: true })
      .boundingBox(),
    settingsBox = await modal.boundingBox();
  assert(
    settingsSave.y + settingsSave.height <=
      settingsBox.y + settingsBox.height - 6,
  );
  await page.waitForTimeout(220);
  await page.screenshot({
    path: "artifacts/operational-model-settings.jpg",
    type: "jpeg",
    quality: 90,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await modal.evaluate((e) => getComputedStyle(e).animationName),
    "none",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Close tools", exact: true }).click();
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await page.getByLabel("Search workflows", { exact: true }).fill("");
  await page.getByRole("tab", { name: "My workflows", exact: true }).click();
  await page
    .getByText(
      "No saved workflows. Choose an example or ask your assistant to create one.",
      { exact: true },
    )
    .waitFor();
  await page.getByRole("tab", { name: "Examples", exact: true }).click();
  assert.equal(await page.locator(".example-card").count(), 37);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForTimeout(200);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "artifacts/operational-workspace-desktop.jpg",
    type: "jpeg",
    quality: 90,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".work-desk").isVisible(), false);
  assert(
    await page
      .getByLabel("Message your assistant", { exact: true })
      .isVisible(),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "artifacts/operational-workspace-mobile.jpg",
    type: "jpeg",
    quality: 88,
  });
  assert.equal(f.state.calls.length, 0);
  assert.equal(f.state.writes, 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS practical workspace density, workflow search, persistent keyboard/drag panel resizing during polling, contextual input/output/activity/results, independent modal scrolling, shared settings styling, reduced motion and laptop/desktop/mobile layouts; no model/tool execution.",
  );
} finally {
  await browser.close();
  await f.close();
}
