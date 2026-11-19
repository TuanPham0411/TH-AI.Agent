import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";
import { companyFixture } from "./company-v2-fixture.mjs";
import { defaultCompanySettings } from "../site/company-v2-model.js";
const f = await companyFixture(process.env.TEST_DATABASE_URL),
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
try {
  const settings = { ...defaultCompanySettings(), revision: 0 };
  settings.policy.allowPaid = true;
  await f.json("company/settings", settings, "PUT");
  for (const slot of ["assistant", "director"])
    await f.setSecret("company_ai_" + slot + "_gemini", { key: "fixture-key" });
  await f.json(
    "company/connections/odssg_vn",
    {
      kind: "odbc",
      name: "Documents",
      baseUrl: "https://gateway.fixture",
      secret: { key: "fixture-token" },
    },
    "PUT",
  );
  const id = (
    await f.json("company/messages", {
      requestId: randomUUID(),
      text: "Export 10-ADU8 to Excel",
      reviewPlan: true,
    })
  ).value.job.id;
  await f.settle(id, "waiting_input");
  const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(f.origin + "/#work/" + id);
  await page.locator(".flow-step").first().waitFor();
  assert.equal(await page.locator(".flow-step").count(), 2);
  assert.equal(f.state.queries, 0);
  await page
    .locator(".workflow-controls")
    .getByRole("button", { name: "Edit workflow", exact: true })
    .click();
  await page
    .getByLabel("Workflow title", { exact: true })
    .fill("Reviewed export");
  await page
    .getByLabel("Block title step-2", { exact: true })
    .fill("Deliver reviewed spreadsheet");
  await page
    .getByRole("button", { name: "Save workflow", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Reviewed export", exact: true })
    .waitFor();
  await page.screenshot({
    path: "artifacts/work-management-reviewed-workflow.jpg",
    type: "jpeg",
    quality: 90,
  });
  await page
    .locator(".workflow-controls")
    .getByRole("button", { name: "Resume", exact: true })
    .click();
  await page
    .locator(".delivered-files a")
    .filter({ hasText: ".xlsx" })
    .first()
    .waitFor();
  assert.equal(
    await page
      .getByRole("progressbar", { name: "Workflow progress" })
      .getAttribute("value"),
    "2",
  );
  assert.equal(f.state.queries, 1);
  const job = (await f.json("company/jobs/" + id)).value.job;
  const recipe = (await f.json("company/workspace")).value.recipes.find(
    (r) => r.id === job.recipeId,
  );
  await f.json(
    "company/recipes/" + recipe.id + "/automation",
    {
      revision: recipe.revision,
      enabled: true,
      intervalMinutes: 30,
      maxRunsPerDay: 2,
      maxCalls: 2,
    },
    "PUT",
  );
  await page.getByRole("button", { name: "Work manager", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Automation", exact: true })
    .click();
  let row = page
    .locator(".automation-row")
    .filter({ hasText: "Reviewed export" });
  await row.getByText("Scheduled", { exact: true }).waitFor();
  await row.getByRole("button", { name: "Pause", exact: true }).click();
  await row.getByText("Off", { exact: true }).waitFor();
  await row.getByRole("button", { name: "Play", exact: true }).click();
  await row.getByText("Scheduled", { exact: true }).waitFor();
  await row.getByRole("button", { name: "Stop", exact: true }).click();
  await row.getByText("Off", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await page.getByLabel("Search tasks", { exact: true }).fill("Reviewed");
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await page
    .getByRole("button", { name: "Clear this chat history", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete chat messages", exact: true })
    .click();
  await page
    .getByText("No chat messages for this task.", { exact: true })
    .waitFor();
  assert.equal(
    (await f.json("company/jobs/" + id)).value.job.result.files.length,
    job.result.files.length,
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete connection", exact: true })
    .click();
  await page
    .getByText("No tools connected yet. Choose the service you actually use.", {
      exact: true,
    })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS real reviewed plan editing/resume/Excel/progress, task and chat navigation, per-task history clearing with results retained, automation Play/Pause/Stop, connection deletion, no browser errors. Model and platform calls use fixtures.",
  );
} finally {
  await browser.close();
  await f.close();
}
