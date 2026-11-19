import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { companyFixture } from "./company-v2-fixture.mjs";
if (!process.env.TEST_DATABASE_URL)
  throw Error("Use a disposable TEST_DATABASE_URL.");
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
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page
    .getByRole("heading", { name: "Connections", exact: true })
    .waitFor();
  assert.equal(await page.locator(".connector-choice").count(), 16);
  await page
    .getByRole("button", { name: /NET Network \/ internal API/ })
    .click();
  assert(
    await page.getByLabel("HTTPS service origin", { exact: true }).isVisible(),
  );
  assert.equal(
    await page.getByLabel("Database host", { exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByLabel("API token / password", { exact: true }).isVisible(),
    false,
  );
  await page
    .getByLabel("Authentication", { exact: true })
    .selectOption("basic");
  assert(await page.getByLabel("API username", { exact: true }).isVisible());
  assert(
    await page.getByLabel("API token / password", { exact: true }).isVisible(),
  );
  await page.screenshot({
    path: "artifacts/typed-network-connection.jpg",
    type: "jpeg",
    quality: 88,
  });
  await page
    .getByLabel("Connection type", { exact: true })
    .selectOption("postgres");
  assert(await page.getByLabel("Database host", { exact: true }).isVisible());
  assert.equal(
    await page.getByLabel("HTTPS service origin", { exact: true }).count(),
    0,
  );
  await page.getByLabel("Connection ID", { exact: true }).fill("test_database");
  await page
    .getByLabel("Display name", { exact: true })
    .fill("Internal PostgreSQL");
  await page.getByLabel("Database host", { exact: true }).fill("data.internal");
  await page
    .getByLabel("Database / service name", { exact: true })
    .fill("operations");
  await page.getByLabel("Database user", { exact: true }).fill("readonly");
  await page
    .getByLabel("Database password", { exact: true })
    .fill("fixture-private-only");
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
  assert(
    !(
      await page.request
        .get(f.origin + "/api/company/workspace")
        .then((r) => r.text())
    ).includes("fixture-private-only"),
  );
  await page
    .getByRole("button", { name: "All connections", exact: true })
    .click();
  await page
    .getByRole("button", { name: "＋ Add a connection", exact: true })
    .click();
  await page.screenshot({
    path: "artifacts/typed-connection-catalog.jpg",
    type: "jpeg",
    quality: 88,
  });
  await page.getByRole("button", { name: /WA WhatsApp Business/ }).click();
  assert(await page.getByLabel("Phone-number ID", { exact: true }).isVisible());
  assert(
    await page
      .getByLabel("WhatsApp Business account ID", { exact: true })
      .isVisible(),
  );
  assert.equal(
    await page.getByLabel("Facebook Page ID", { exact: true }).count(),
    0,
  );
  await page
    .getByLabel("Connection type", { exact: true })
    .selectOption("messenger");
  assert(
    await page.getByLabel("Messenger Page ID", { exact: true }).isVisible(),
  );
  assert.equal(
    await page
      .getByLabel("WhatsApp Business account ID", { exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "All connections", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pair / manage a computer", exact: true })
    .click();
  await page
    .getByLabel("Computer name", { exact: true })
    .fill("My test laptop");
  await page
    .getByRole("button", { name: "Create pairing token", exact: true })
    .click();
  await page.locator(".pairing-token").waitFor();
  const token = await page.locator(".pairing-token").textContent();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert(
    !(await page.locator(".pairing-section pre").textContent()).includes(token),
  );
  assert(
    (await page.locator(".pairing-section pre").textContent()).includes(
      "-FullControl",
    ),
  );
  const d = (await f.json("company/devices")).value.devices[0];
  await f.pool.query(
    "UPDATE company_devices SET last_seen=now(),capabilities=$2 WHERE id=$1",
    [
      d.id,
      JSON.stringify({
        execution: "desktop",
        unattended: false,
        platform: "Windows",
        fullControl: true,
        actions: [
          {
            id: "office",
            effect: "write",
            description: "Desktop Office COM. Installed Office required.",
          },
          {
            id: "execute",
            effect: "write",
            description: "Account-level Python/PowerShell execution.",
          },
        ],
      }),
    ],
  );
  await page
    .getByRole("button", {
      name: "Agent started — refresh devices",
      exact: true,
    })
    .click();
  await page.getByText("Online", { exact: true }).waitFor();
  await page.screenshot({
    path: "artifacts/paired-device-management.jpg",
    type: "jpeg",
    quality: 88,
  });
  await page
    .getByRole("button", { name: "Use this computer", exact: true })
    .click();
  await page
    .getByLabel("Approved action ID", { exact: true })
    .selectOption("office");
  await page
    .getByLabel("Connection ID", { exact: true })
    .fill("desktop_office");
  await page
    .getByLabel("Display name", { exact: true })
    .fill("My desktop Office");
  await page
    .getByRole("button", { name: "Save secure connection", exact: true })
    .click();
  await page
    .getByText(
      "Saved securely. Continue the waiting work from your assistant.",
      { exact: true },
    )
    .waitFor();
  await page
    .getByRole("button", { name: "Test saved connection", exact: true })
    .click();
  await page
    .getByText("Computer verified. Desktop tools need this computer online.", {
      exact: true,
    })
    .waitFor();
  await page.screenshot({
    path: "artifacts/typed-office-device.jpg",
    type: "jpeg",
    quality: 88,
  });
  const saved = (await f.json("company/workspace")).value.connections.find(
    (c) => c.id === "desktop_office",
  );
  assert.equal(saved.execution, "desktop");
  assert.equal(saved.unattended, false);
  assert.equal(saved.effect, "write");
  await page
    .getByRole("button", { name: "All connections", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pair / manage a computer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Revoke access", exact: true })
    .click();
  await page.getByText("Revoked", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS typed database/network/social forms, credential privacy, pairing token isolation, local capability discovery, desktop verification/refusal of unattended status and revocation. Device online status uses a fixture here; real outbound Python execution is tested separately.",
  );
} finally {
  await browser.close();
  await f.close();
}
