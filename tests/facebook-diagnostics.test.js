import test from "node:test";
import assert from "node:assert/strict";
import { createCompanyTools } from "../server/company-v2-tools.js";
const connection = { id: "page", kind: "facebook", accountId: "123456" },
  step = {
    tool: "publish",
    connection: "page",
    args: { caption: "Approved caption" },
  };
for (const [code, text] of [
  [190, /expired/],
  [200, /pages_manage_posts/],
  [100, /parameters/],
  [613, /usage limit/],
  [368, /restricted/],
])
  test(
    "Facebook rejection code " +
      code +
      " gives bounded private-safe guidance without retry",
    async () => {
      let calls = 0;
      const tool = createCompanyTools({
        getSecret: async () => ({ key: "private-page-token" }),
        request: async (url, options) => {
          calls++;
          assert(options.acceptErrors);
          assert(options.includeHeaders);
          return {
            status: 400,
            data: {
              error: {
                code,
                error_subcode: 42,
                message:
                  "private-page-token https://private.example/?access_token=secret",
                debug: "private",
              },
            },
          };
        },
      });
      await assert.rejects(
        () => tool(step, { connections: [connection] }),
        (e) => {
          assert.match(e.message, text);
          assert.equal(e.facebookDiagnostic.code, code);
          assert.equal(e.facebookDiagnostic.subcode, 42);
          assert(!JSON.stringify(e).includes("private-page-token"));
          assert(!e.message.includes("private.example"));
          return true;
        },
      );
      assert.equal(calls, 1);
    },
  );
test("Facebook 5xx and network failures remain uncertain without write retries", async () => {
  for (const failure of ["server", "network"]) {
    let calls = 0;
    const tool = createCompanyTools({
      getSecret: async () => ({ key: "private-token" }),
      request: async () => {
        calls++;
        if (failure === "network") throw Error("socket closed");
        return { status: 503, data: { error: { code: 2 } } };
      },
    });
    await assert.rejects(
      () => tool(step, { connections: [connection] }),
      (e) => {
        assert.equal(e.uncertain, true);
        assert.match(e.message, /Check the Page before retrying/);
        return true;
      },
    );
    assert.equal(calls, 1);
  }
});
test("Facebook success requires the actual publication receipt", async () => {
  const tool = createCompanyTools({
    getSecret: async () => ({ key: "private-token" }),
    request: async () => ({ status: 200, data: { id: "123456_789" } }),
  });
  assert.equal(
    (await tool(step, { connections: [connection] })).receipt,
    "123456_789",
  );
});
