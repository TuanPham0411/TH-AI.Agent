import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { companyFixture } from "./company-v2-fixture.mjs";
const f = await companyFixture(process.env.TEST_DATABASE_URL),
  b = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
try {
  const d = (await f.json("company/devices", { name: "My browser laptop" }))
    .value;
  await f.pool.query(
    "UPDATE company_devices SET capabilities=$2,last_seen=now() WHERE id=$1",
    [
      d.id,
      JSON.stringify({
        execution: "desktop",
        unattended: false,
        actions: [
          { id: "facebook_publish", effect: "write", description: "Publish" },
          { id: "facebook_login", effect: "write", description: "Login" },
          { id: "facebook_check", effect: "read", description: "Check" },
        ],
      }),
    ],
  );
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } }),
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  let logins = 0;
  await p.route("**/api/company/connections/*/browser-login", (route) => {
    logins++;
    return route.fulfill({
      json: {
        message: "Complete login on your laptop, then close that window.",
      },
    });
  });
  await p.route("**/api/company/connections/*/check", (route) =>
    route.fulfill({
      json: {
        verified: true,
        execution: "desktop",
        unattended: false,
        note: "Browser session checked; no post sent.",
      },
    }),
  );
  await p.goto(f.origin);
  await p.getByRole("button", { name: "Connections", exact: true }).click();
  await p
    .getByRole("button", { name: "＋ Add a connection", exact: true })
    .click();
  await p
    .locator(".connector-choice")
    .filter({ hasText: "Facebook · Browser on your computer" })
    .click();
  await p.getByLabel("Connection ID", { exact: true }).fill("facebook_browser");
  await p
    .getByLabel("Display name", { exact: true })
    .fill("My Facebook browser");
  await p.getByLabel("Paired computer", { exact: true }).selectOption(d.id);
  await p
    .getByLabel("Facebook destination URL", { exact: true })
    .fill("https://www.facebook.com/TestPage");
  await p
    .getByLabel("Facebook posting identity name", { exact: true })
    .fill("Test Page");
  assert.equal(await p.locator("input[type=password]").count(), 0);
  await p
    .getByRole("button", { name: "Save secure connection", exact: true })
    .click();
  await p
    .getByText(
      "Saved securely. Continue the waiting work from your assistant.",
      { exact: true },
    )
    .waitFor();
  const c = (await f.json("company/workspace")).value.connections[0];
  assert.equal(c.transport, "device");
  assert.equal(c.unattended, false);
  assert.equal(c.kind, "facebook_browser");
  await p
    .getByRole("button", { name: "Open Facebook sign-in", exact: true })
    .click();
  await p
    .getByText("Complete login on your laptop, then close that window.", {
      exact: true,
    })
    .waitFor();
  assert.equal(logins, 1);
  await p
    .getByRole("button", { name: "Test saved connection", exact: true })
    .click();
  await p
    .getByText("Browser session checked; no post sent.", { exact: true })
    .waitFor();
  await p.screenshot({
    path: "artifacts/facebook-browser-connection.jpg",
    type: "jpeg",
    quality: 90,
  });
  await p.getByRole("button", { name: "Close dialog", exact: true }).click();
  await p.getByRole("button", { name: "Workflows", exact: true }).click();
  await p.getByLabel("Search workflows", { exact: true }).fill("browser");
  assert.equal(await p.locator(".example-card").count(), 2);
  assert.deepEqual(errors, []);
  console.log(
    "PASS browser connector form has paired device/destination/identity and no API token/password fields, durable save, interactive-login/test controls and two inactive browser workflow examples. Login/browser response uses fixtures, no Facebook posting.",
  );
} finally {
  await b.close();
  await f.close();
}
