import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { companyFixture } from "./company-v2-fixture.mjs";
const f = await companyFixture(process.env.TEST_DATABASE_URL),
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
try {
  const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(f.origin);
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  assert.equal(await page.locator(".example-card").count(), 37);
  await page.screenshot({
    path: "artifacts/workflow-example-library.jpg",
    type: "jpeg",
    quality: 88,
  });
  const parallel = page.locator(".example-card").filter({
    has: page.getByRole("heading", {
      name: "Parallel databases → join → Excel",
      exact: true,
    }),
  });
  await parallel
    .getByRole("button", { name: "Preview workflow", exact: true })
    .click();
  assert.equal(await page.locator(".flow-step").count(), 4);
  assert.equal(await page.locator('.step-route[data-to="step-3"]').count(), 2);
  assert.equal(
    await page.locator('.data-route[data-target="step-3"]').count(),
    2,
  );
  assert.equal(await page.locator(".mind-hub").count(), 2);
  await page.screenshot({
    path: "artifacts/parallel-workflow-preview.jpg",
    type: "jpeg",
    quality: 88,
  });
  assert.equal(f.state.calls.length, 0);
  assert.equal((await f.json("company/workspace")).value.jobs.length, 0);
  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  const card = page.locator(".example-card").filter({
    has: page.getByRole("heading", {
      name: "Query → condition → export or empty result",
      exact: true,
    }),
  });
  await card
    .getByRole("button", { name: "Configure a copy", exact: true })
    .click();
  await page
    .getByLabel("Workflow title", { exact: true })
    .fill("My conditional data workflow");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByText("Draft saved. No tools were run and automation remains off.", {
      exact: true,
    })
    .waitFor();
  const saved = (await f.json("company/workspace")).value.recipes.find(
    (r) => r.title === "My conditional data workflow",
  );
  assert(saved);
  assert.equal(saved.draft, true);
  assert.equal(saved.automation.enabled, false);
  assert.equal(saved.procedure[2].when.value, true);
  assert.equal(saved.procedure[3].when.value, false);
  const denied = await f.json(
    "company/recipes/" + saved.id + "/automation",
    {
      revision: saved.revision,
      enabled: true,
      intervalMinutes: 60,
      maxRunsPerDay: 2,
      maxCalls: 4,
      allowWrites: false,
      allowMedia: false,
    },
    "PUT",
  );
  assert.equal(denied.status, 400);
  assert.match(denied.value.error, /verify this draft/);
  await page
    .getByRole("button", { name: "Preview saved draft", exact: true })
    .click();
  await page.locator('.flow-step[data-step-id="step-5"]').waitFor();
  assert.equal(await page.locator(".flow-step").count(), 5);
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await page.screenshot({
    path: "artifacts/conditional-workflow-preview.jpg",
    type: "jpeg",
    quality: 88,
  });
  assert.equal(f.state.calls.length, 0);
  assert.equal((await f.json("company/workspace")).value.jobs.length, 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS 37 inactive examples, parallel/conditional graph previews, editable draft persistence, no execution/model calls during preview/setup, and automation refusal until a verified run.",
  );
} finally {
  await browser.close();
  await f.close();
}
