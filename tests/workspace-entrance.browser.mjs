import assert from "node:assert/strict";
import express from "express";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
const app = express();
app.get("/api/auth/session", async (req, res) => {
  await new Promise((r) => setTimeout(r, 450));
  res.json({ authenticated: false });
});
app.get("/api/company/workspace", (req, res) =>
  res.status(401).json({ error: "Sign in required." }),
);
app.use(express.static(path.resolve("dist/web")));
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const origin = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
try {
  await mkdir("artifacts", { recursive: true });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.locator(".workspace-build-cursor").first().waitFor();
  assert.equal(await page.locator(".workspace-build-cursor").count(), 4);
  assert.equal(
    await page.locator(".workspace-build-layer").getAttribute("aria-hidden"),
    "true",
  );
  await page.waitForTimeout(750);
  assert.equal(await page.locator(".workspace-build-cursor").count(), 4);
  await page.screenshot({
    path: "artifacts/swarm-workspace-entrance.jpg",
    type: "jpeg",
    quality: 90,
  });
  const button = page.getByRole("button", { name: "Sign in", exact: true });
  const hit = await button.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return (
      document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === e
    );
  });
  assert(hit, "Decorative cursors must not intercept controls.");
  await page
    .locator(".workspace-build-layer")
    .waitFor({ state: "detached", timeout: 4000 });
  assert.equal(
    await page.locator("html").getAttribute("data-workspace-assembling"),
    null,
  );
  assert.equal(
    await page
      .locator(".desk-header")
      .evaluate((e) => getComputedStyle(e).opacity),
    "1",
  );
  // Re-render via an ordinary UI action must not replay a document entrance.
  await page.getByRole("button", { name: "TH", exact: true }).click();
  assert.equal(await page.locator(".workspace-build-layer").count(), 0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".workspace-build-cursor").first().waitFor();
  await page.getByLabel("Message your assistant", { exact: true }).click();
  await page
    .getByLabel("Message your assistant", { exact: true })
    .fill("Ready immediately");
  assert.equal(await page.locator(".workspace-build-layer").count(), 0);
  assert.equal(
    await page
      .getByLabel("Message your assistant", { exact: true })
      .inputValue(),
    "Ready immediately",
  );
  const reduced = await browser.newContext({ reducedMotion: "reduce" }),
    quiet = await reduced.newPage();
  await quiet.goto(origin);
  await quiet
    .getByRole("heading", { name: "Assistant", exact: true })
    .waitFor();
  assert.equal(await quiet.locator(".workspace-build-layer").count(), 0);
  assert.equal(
    await quiet
      .locator(".assistant-desk")
      .evaluate((e) => getComputedStyle(e).opacity),
    "1",
  );
  await reduced.close();
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await mobile.goto(origin, { waitUntil: "domcontentloaded" });
  await mobile.locator(".workspace-build-cursor").first().waitFor();
  assert.equal(await mobile.locator(".workspace-build-cursor").count(), 2);
  assert(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS document-entry swarm builds real UI, survives initial auth re-render without duplicating, cleans up automatically, does not intercept controls, dismisses on input, does not replay on ordinary actions, respects reduced motion and bounds mobile overlays; no model calls.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
