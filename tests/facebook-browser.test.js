import test from "node:test";
import assert from "node:assert/strict";
import { normalizeConnection } from "../server/company-connections.js";
import { publishInBrowser } from "../server/facebook-browser.js";
import { resolveToolStep } from "../server/company-v2-tools.js";
const deviceId = "11111111-1111-4111-8111-111111111111";
test("Facebook browser metadata uses a paired device and no API credentials", () => {
  const { value, secret } = normalizeConnection("facebook_browser", {
    name: "Browser",
    deviceId,
    pageUrl: "https://www.facebook.com/TestPage",
    expectedName: "Test Page",
    allowPublish: false,
    secret: {},
  });
  assert.equal(value.transport, "device");
  assert.equal(value.action, "facebook_publish");
  assert.equal(value.unattended, false);
  assert.deepEqual(secret, {});
  for (const pageUrl of [
    "https://evil.example/Page",
    "https://www.facebook.com/login",
    "http://www.facebook.com/Page",
    "https://www.facebook.com/Page?token=x",
  ])
    assert.throws(() =>
      normalizeConnection("facebook_browser", {
        name: "Browser",
        deviceId,
        pageUrl,
        expectedName: "Page",
        secret: {},
      }),
    );
});
test("browser publication is bound to connection/revision, preserves uploaded assets and requires an actual Facebook receipt", async () => {
  let input,
    calls = 0;
  const conn = { id: "browser", revision: 3, deviceId };
  const result = await publishInBrowser(
    null,
    conn,
    { caption: "Approved", link: "https://example.org/", assetId: deviceId },
    {
      invoke: async (pool, id, action, value, options) => {
        calls++;
        assert.equal(id, deviceId);
        assert.equal(action, "facebook_publish");
        assert.equal(options.expectedEffect, "write");
        input = value;
        return {
          ok: true,
          output: {
            status: "published",
            confirmed: true,
            url: "https://www.facebook.com/Test/posts/123",
            browserClosed: true,
          },
        };
      },
    },
  );
  assert.equal(result.confirmed, true);
  assert.equal(result.transport, "browser");
  assert.equal(input.connectionId, "browser");
  assert.equal(input.connectionRevision, 3);
  assert.equal(input.assetId, deviceId);
  assert(!("pageUrl" in input));
  assert.equal(input.caption, "Approved\nhttps://example.org/");
  assert.equal(calls, 1);
  for (const output of [
    { status: "needs_login", message: "Sign in locally" },
    { status: "uncertain", message: "Check Facebook" },
    {
      status: "published",
      confirmed: true,
      url: "https://evil.example/posts/123",
    },
  ])
    await assert.rejects(
      () =>
        publishInBrowser(
          null,
          conn,
          { caption: "Approved" },
          { invoke: async () => ({ ok: true, output }) },
        ),
      (e) => {
        assert.equal(e.uncertain, output.status !== "needs_login");
        return true;
      },
    );
  await assert.rejects(
    () =>
      publishInBrowser(null, conn, {
        caption: "Caption",
        imageUrl: "https://example.org/a.jpg",
      }),
    /saved assetId/,
  );
});
test("generated archived media maps to an actual upload asset instead of a URL-only post", () => {
  const step = resolveToolStep(
    { tool: "publish", args: { caption: "Approved", mediaFrom: "step-1" } },
    [
      {
        id: "step-1",
        state: "completed",
        result: {
          mediaUrls: ["https://media.example/image.png"],
          files: [{ id: deviceId }],
        },
      },
    ],
  );
  assert.equal(step.args.assetId, deviceId);
  assert.equal(step.args.imageUrl, undefined);
});
