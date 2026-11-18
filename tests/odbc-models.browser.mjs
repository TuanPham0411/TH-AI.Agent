import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { companyFixture } from "./company-v2-fixture.mjs";
const f = await companyFixture(process.env.TEST_DATABASE_URL),
  browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
try {
  const d = (await f.json("company/devices", { name: "Windows ODBC laptop" }))
    .value;
  await f.pool.query(
    "UPDATE company_devices SET capabilities=$2,last_seen=now() WHERE id=$1",
    [
      d.id,
      JSON.stringify({
        execution: "desktop",
        unattended: false,
        platform: "Windows",
        odbc: {
          available: true,
          bitness: 64,
          drivers: ["Oracle ODBC"],
          dataSources: [{ name: "odssg_vn", driver: "Oracle ODBC" }],
        },
        actions: [
          {
            id: "odbc_query",
            effect: "read",
            description: "Read-only DSN query.",
          },
        ],
      }),
    ],
  );
  const page = await browser.newPage({
      viewport: { width: 1500, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(f.origin);
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page.getByRole("button", { name: /DB ODBC \/ DSN/ }).click();
  assert.equal(
    await page
      .getByLabel("ODBC connection method", { exact: true })
      .inputValue(),
    "device",
  );
  assert.equal(
    await page.getByLabel("HTTPS gateway URL", { exact: true }).count(),
    0,
  );
  await page.getByText(/ODBC available · Python 64-bit/).waitFor();
  await page.getByLabel("Connection ID", { exact: true }).fill("odssg_vn");
  await page
    .getByLabel("Display name", { exact: true })
    .fill("Oracle odssg_vn");
  await page.getByLabel("DSN name", { exact: true }).fill("odssg_vn");
  await page
    .getByLabel("Database dialect", { exact: true })
    .selectOption("oracle");
  await page
    .getByLabel("Database user ID", { exact: true })
    .fill("fixture-reader");
  await page
    .getByLabel("Database password", { exact: true })
    .fill("fixture-only-password");
  await page
    .getByRole("button", { name: "Save secure connection", exact: true })
    .click();
  await page
    .getByText(
      "Saved securely. Continue the waiting work from your assistant.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page.getByLabel("Database password", { exact: true }).inputValue(),
    "",
  );
  const workspace = (await f.json("company/workspace")).value,
    connection = workspace.connections.find((c) => c.id === "odssg_vn");
  assert.equal(connection.transport, "device");
  assert.equal(connection.dialect, "oracle");
  assert.equal(connection.unattended, false);
  assert(!JSON.stringify(workspace).includes("fixture-only-password"));
  await page.screenshot({
    path: "artifacts/client-odbc-setup.jpg",
    type: "jpeg",
    quality: 88,
  });
  await page.getByRole("button", { name: "×", exact: true }).click();
  await page
    .getByRole("button", { name: "Company setup", exact: true })
    .click();
  const old = await page
    .getByLabel("assistant model", { exact: true })
    .inputValue();
  await page
    .getByLabel("assistant API key", { exact: true })
    .fill("fixture-private-role-model-key");
  await page
    .locator(".setup-slot")
    .first()
    .getByRole("button", { name: "Save key / refresh models", exact: true })
    .click();
  await page
    .getByLabel("assistant available models", { exact: true })
    .getByRole("option", { name: /fixture-gemini-latest/ })
    .waitFor({ state: "attached" });
  assert.equal(
    await page.getByLabel("assistant model", { exact: true }).inputValue(),
    old,
  );
  assert.equal(
    await page.getByLabel("assistant API key", { exact: true }).inputValue(),
    "",
  );
  await page
    .getByLabel("assistant available models", { exact: true })
    .selectOption("fixture-gemini-latest");
  assert.equal(
    await page.getByLabel("assistant model", { exact: true }).inputValue(),
    "fixture-gemini-latest",
  );
  await page.getByText(/Version: 2026-test/).waitFor();
  await page.screenshot({
    path: "artifacts/live-model-catalog-setup.jpg",
    type: "jpeg",
    quality: 88,
  });
  assert.equal(f.state.calls.length, 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS paired ODBC form, architecture/DSN discovery, private credential handling and role-specific live model selection without automatic model replacement or inference calls. Device/Oracle metadata and model lists use fixtures.",
  );
} finally {
  await browser.close();
  await f.close();
}
