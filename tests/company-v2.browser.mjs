import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { companyFixture } from "./company-v2-fixture.mjs";
if (!process.env.TEST_DATABASE_URL)
  throw Error(
    "Use an isolated TEST_DATABASE_URL for the new end-to-end company test.",
  );
const f = await companyFixture(process.env.TEST_DATABASE_URL),
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
await mkdir("artifacts", { recursive: true });
try {
  const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
      acceptDownloads: true,
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(f.origin + "/#workflow");
  await page.getByRole("heading", { name: "Assistant", exact: true }).waitFor();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  assert.equal(await page.locator(".studio").count(), 0);
  await page.screenshot({
    path: "artifacts/company-v2-welcome.jpg",
    type: "jpeg",
    quality: 88,
  });
  await page
    .getByLabel("Message your assistant", { exact: true })
    .fill(
      "Find the 10-ADU8 documents in table A of odssg_vn and give me an Excel file.",
    );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page
    .getByRole("button", { name: "Secure AI setup", exact: true })
    .waitFor();
  assert.equal(f.state.calls.length, 0);
  await page
    .getByRole("button", { name: "Secure AI setup", exact: true })
    .click();
  await page
    .getByLabel("assistant model", { exact: true })
    .fill("fixture-assistant-model");
  await page
    .getByLabel("director model", { exact: true })
    .fill("fixture-director-model");
  await page
    .getByLabel("assistant API key", { exact: true })
    .fill("fixture-assistant-key");
  await page
    .getByLabel("director API key", { exact: true })
    .fill("fixture-director-key");
  await page
    .getByLabel("Allow provider charges within the bounded workflow budget", {
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Save company setup", exact: true })
    .click();
  await page
    .getByText("Saved. Your pending request can now continue.", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("assistant API key", { exact: true }).inputValue(),
    "",
  );
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Connection updated — continue", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Set up odbc", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Set up odbc", exact: true }).click();
  await page
    .getByLabel("ODBC connection method", { exact: true })
    .selectOption("https");
  assert.equal(
    await page.getByLabel("Connection ID", { exact: true }).inputValue(),
    "odssg_vn",
  );
  await page
    .getByLabel("HTTPS gateway URL", { exact: true })
    .fill("https://gateway.fixture");
  await page
    .getByLabel("Private access token", { exact: true })
    .fill("fixture-gateway-token");
  await page
    .getByRole("button", { name: "Save secure connection", exact: true })
    .click();
  await page
    .getByText(
      "Saved securely. Continue the waiting work from your assistant.",
      { exact: true },
    )
    .waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Connection updated — continue", exact: true })
    .click();
  const file = page
    .locator(".assistant-message .delivered-files a")
    .filter({ hasText: "documents-10-ADU8.xlsx" });
  await file.waitFor();
  const downloading = page.waitForEvent("download");
  await file.click();
  const download = await downloading;
  await download.saveAs("artifacts/company-v2-actual-documents.xlsx");
  const bytes = await readFile("artifacts/company-v2-actual-documents.xlsx");
  assert(bytes.includes(Buffer.from("10-ADU8-001")));
  assert(!bytes.includes(Buffer.from("99-OTHER")));
  assert.equal(f.state.queries, 1);
  assert.equal(await page.locator(".flow-step.completed").count(), 2);
  await page.screenshot({
    path: "artifacts/company-v2-excel-delivery.jpg",
    type: "jpeg",
    quality: 88,
  });
  await page
    .locator(".workflow-controls")
    .getByRole("button", { name: "Automation", exact: true })
    .click();
  await page
    .getByLabel("Run independently on the server", { exact: true })
    .check();
  await page.getByLabel("Maximum runs per day", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Save automation", exact: true })
    .click();
  await page
    .getByText("Automation is enabled. You can leave this tab.", {
      exact: true,
    })
    .waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .locator(".workflow-controls")
    .getByRole("button", { name: "Automation on", exact: true })
    .waitFor();
  const newTab = page.waitForEvent("popup");
  await page
    .getByRole("link", { name: "Open work tab →", exact: true })
    .click();
  const workTab = await newTab;
  await workTab
    .getByRole("heading", { name: "10-ADU8 / Document export", exact: true })
    .waitFor();
  assert(new URL(workTab.url()).hash.startsWith("#work/"));
  await workTab.close();
  assert.equal(f.state.queries, 1);
  await page
    .getByLabel("Message your assistant", { exact: true })
    .fill("I’m feeling low. Post something thoughtful to my Facebook Page.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page
    .getByRole("button", { name: "Set up facebook", exact: true })
    .waitFor();
  await page
    .getByLabel("Message your assistant", { exact: true })
    .fill("Keep this unsent note while work updates.");
  await page.waitForTimeout(2700);
  assert.equal(
    await page
      .getByLabel("Message your assistant", { exact: true })
      .inputValue(),
    "Keep this unsent note while work updates.",
  );
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    "assistant-input",
  );
  await page
    .getByRole("button", { name: "Set up facebook", exact: true })
    .click();
  await page.getByLabel("Connection ID", { exact: true }).fill("my_page");
  await page.getByLabel("Display name", { exact: true }).fill("My Page");
  await page.getByLabel("Facebook Page ID", { exact: true }).fill("123456");
  await page
    .getByLabel("Private access token", { exact: true })
    .fill("fixture-page-token");
  assert.equal(
    await page
      .getByLabel(
        "Allow this assistant to publish to this Page without asking each time",
        { exact: true },
      )
      .isChecked(),
    false,
  );
  await page
    .getByRole("button", { name: "Save secure connection", exact: true })
    .click();
  await page
    .getByText(
      "Saved securely. Continue the waiting work from your assistant.",
      { exact: true },
    )
    .waitFor();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Connection updated — continue", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Approve this publication", exact: true })
    .waitFor();
  assert.equal(f.state.writes, 0);
  await page.screenshot({
    path: "artifacts/company-v2-publication-review.jpg",
    type: "jpeg",
    quality: 88,
  });
  await page
    .getByRole("button", { name: "Approve this publication", exact: true })
    .click();
  await page
    .locator(".assistant-message .delivered-files a")
    .filter({ hasText: "Open confirmed publication" })
    .waitFor();
  assert.equal(f.state.writes, 1);
  assert.deepEqual([...new Set(f.state.calls.map((c) => c.slot))].sort(), [
    "assistant",
    "director",
  ]);
  assert.equal(f.state.calls.filter((c) => c.slot === "assistant").length, 2);
  assert(
    f.state.calls.every(
      (c) => !JSON.stringify(c).includes("fixture-page-token"),
    ),
  );
  await page.screenshot({
    path: "artifacts/company-v2-live-company.jpg",
    type: "jpeg",
    quality: 88,
  });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.screenshot({
    path: "artifacts/company-v2-laptop.jpg",
    type: "jpeg",
    quality: 85,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.locator(".work-desk").isVisible(), false);
  assert.equal(
    await page
      .locator(".assistant-message .delivered-files a")
      .filter({ hasText: "documents-10-ADU8.xlsx" })
      .count(),
    1,
  );
  await page.screenshot({
    path: "artifacts/company-v2-mobile.jpg",
    type: "jpeg",
    quality: 85,
  });
  const scripts = await page.evaluate(() =>
    performance.getEntriesByType("resource").map((r) => r.name),
  );
  assert(!scripts.some((url) => /\/assets\/app-[^/]+\.js/.test(url)));
  assert.deepEqual(errors, []);
  console.log(
    "PASS new default light company UI, two-model secure setup, persistent conversational clarification, real SQL-to-XLSX download, protected Page setup/approval/receipt, focus preservation, laptop/mobile, and no legacy editor download. Models and Facebook use fixtures; database and exported file are real.",
  );
} finally {
  await browser.close();
  await f.close();
}
