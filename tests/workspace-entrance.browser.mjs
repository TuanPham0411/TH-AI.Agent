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
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error(e.stack);
  });
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await page.locator(".workspace-build-cursor").first().waitFor();
  assert.equal(await page.locator(".workspace-build-cursor").count(), 4);
  assert.equal(
    await page.locator(".workspace-build-layer").getAttribute("aria-hidden"),
    "true",
  );
  await page.waitForTimeout(650);
  assert.equal(await page.locator(".workspace-build-cursor").count(), 4);
  const geometry = await page.evaluate(() => {
    const path = document.querySelector(
      '[data-builder=Assistant] path[data-layout-target=".assistant-heading"]',
    );
    const p = path.getPointAtLength(0),
      r = document.querySelector(".assistant-heading").getBoundingClientRect();
    const group = document.querySelector(
      ".workspace-layout-traces [data-builder=Workflow]",
    );
    const paths = [...group.querySelectorAll("path")],
      active = paths.find((p) => {
        const n = Number(p.style.strokeDashoffset);
        return n > 0 && n < p.getTotalLength();
      });
    const tip = active.getPointAtLength(
      active.getTotalLength() - Number(active.style.strokeDashoffset),
    );
    const matrix = new DOMMatrixReadOnly(
      getComputedStyle(
        document.querySelector(
          ".workspace-build-cursor[data-builder=Workflow]",
        ),
      ).transform,
    );
    return {
      edgeError: Math.abs(p.y - (r.bottom - 0.5)),
      cursorError: Math.hypot(matrix.m41 + 3 - tip.x, matrix.m42 + 2 - tip.y),
      remaining: Number(active.style.strokeDashoffset),
    };
  });
  assert(
    geometry.edgeError < 1,
    "Layout stroke must use the real heading boundary.",
  );
  assert(
    geometry.cursorError < 2,
    "Cursor tip must track the drawn endpoint, not a decorative path.",
  );
  assert(geometry.remaining > 0);
  await page.screenshot({
    path: "artifacts/swarm-layout-drawing.jpg",
    type: "jpeg",
    quality: 90,
  });
  await page.waitForTimeout(1900);
  const typing = await page.evaluate(() => {
    const letters = [...document.querySelectorAll(".workspace-write-letter")];
    return {
      shown: letters.filter((e) => getComputedStyle(e).opacity === "1").length,
      total: letters.length,
      value: document.querySelector("textarea").value,
    };
  });
  assert(
    typing.shown > 0 && typing.shown < typing.total,
    "Real text must be visibly partway through typing.",
  );
  assert.equal(typing.value, "");
  await page.screenshot({
    path: "artifacts/swarm-real-text-writing.jpg",
    type: "jpeg",
    quality: 90,
  });
  // A data/auth render while typing follows the same timeline, not a fresh entrance.
  await page.locator(".desk-mark").evaluate((e) => e.click());
  await page.waitForTimeout(60);
  assert.equal(await page.locator(".workspace-build-cursor").count(), 4);
  assert(
    await page
      .locator(".workspace-write-letter")
      .evaluateAll((es) => es.some((e) => getComputedStyle(e).opacity === "1")),
  );
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
    .waitFor({ state: "detached", timeout: 7000 });
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
  assert.equal(await page.locator(".workspace-write-run").count(), 0);
  assert.equal(
    await page.locator(".brand-name strong").textContent(),
    "Workspace",
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
    "PASS cursors trace actual layout edges at the current SVG stroke endpoint, type real DOM text progressively, preserve input/accessibility text, follow auth/render updates without replay, clean up wrappers/styles, allow immediate interaction and respect reduced motion/mobile bounds; no model calls.",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
