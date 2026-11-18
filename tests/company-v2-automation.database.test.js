import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { companyFixture } from "./company-v2-fixture.mjs";
import { defaultCompanySettings } from "../site/company-v2-model.js";
import { CompanyStore } from "../server/company-v2-store.js";
test(
  "automation is admitted once without a browser, stays inside approved connections and rejects laptop-only tools",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const f = await companyFixture(process.env.TEST_DATABASE_URL);
    t.after(() => f.close());
    const settings = { ...defaultCompanySettings(), revision: 0 };
    settings.policy.allowPaid = true;
    await f.json("company/settings", settings, "PUT");
    await f.setSecret("company_ai_assistant_gemini", { key: "fixture" });
    await f.setSecret("company_ai_director_gemini", { key: "fixture" });
    await f.json(
      "company/connections/odssg_vn",
      {
        kind: "odbc",
        name: "odssg_vn",
        baseUrl: "https://gateway.fixture",
        secret: { key: "fixture-token" },
      },
      "PUT",
    );
    const request = await f.json("company/messages", {
      requestId: randomUUID(),
      text: "Export 10-ADU8 to Excel.",
    });
    const job = await f.settle(request.value.job.id, "completed");
    let recipe = (await f.json("company/workspace")).value.recipes.find(
      (r) => r.id === job.recipeId,
    );
    assert(recipe);
    assert.equal(
      (
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
        )
      ).status,
      200,
    );
    await f.pool.query(
      "UPDATE company_recipes SET value=jsonb_set(value,'{automation,nextRunAt}','0') WHERE id=$1",
      [recipe.id],
    );
    const store = new CompanyStore(f.pool),
      before = Number(
        (await f.pool.query("SELECT count(*) FROM company_jobs")).rows[0].count,
      );
    await Promise.all([store.schedule(), new CompanyStore(f.pool).schedule()]);
    assert.equal(
      Number(
        (await f.pool.query("SELECT count(*) FROM company_jobs")).rows[0].count,
      ),
      before + 1,
    );
    const scheduled = (
      await f.pool.query(
        "SELECT id FROM company_jobs WHERE value ? 'automation' ORDER BY updated_at DESC LIMIT 1",
      )
    ).rows[0];
    await f.settle(scheduled.id, "completed");
    assert.equal(f.state.calls.filter((c) => c.slot === "assistant").length, 1);
    assert.equal(f.state.queries, 2);
    // A laptop-hosted action is refused even if the user checks the write permission box.
    const desktop = "desktop_tool";
    await f.pool.query(
      "INSERT INTO company_connections(id,value) VALUES($1,$2)",
      [
        desktop,
        {
          kind: "bridge",
          name: "My laptop tool",
          execution: "desktop",
          unattended: false,
          verifiedAt: new Date().toISOString(),
          effect: "read",
        },
      ],
    );
    const localRecipe = randomUUID();
    await f.pool.query("INSERT INTO company_recipes(id,value) VALUES($1,$2)", [
      localRecipe,
      {
        title: "Laptop action",
        instructions: "Run the laptop action",
        procedure: [
          { tool: "bridge", connection: desktop, title: "Read local tool" },
        ],
      },
    ]);
    const refused = await f.json(
      "company/recipes/" + localRecipe + "/automation",
      { revision: 1, enabled: true, allowWrites: true },
      "PUT",
    );
    assert.equal(refused.status, 400);
    assert.match(refused.value.error, /laptop|desktop/);
    // Replacing a connection invalidates the previously approved unattended scope.
    await f.pool.query(
      "UPDATE company_connections SET revision=revision+1 WHERE id='odssg_vn'",
    );
    await f.pool.query(
      "UPDATE company_recipes SET value=jsonb_set(value,'{automation,nextRunAt}','0') WHERE id=$1",
      [recipe.id],
    );
    await store.schedule();
    const changed = (
      await f.pool.query(
        "SELECT id FROM company_jobs WHERE value ? 'automation' ORDER BY updated_at DESC LIMIT 1",
      )
    ).rows[0];
    await f.settle(changed.id, "waiting_input");
    assert.equal(f.state.queries, 2);
    await store.schedule();
    recipe = (await f.json("company/workspace")).value.recipes.find(
      (r) => r.id === recipe.id,
    );
    assert.equal(recipe.automation.enabled, false);
    assert.match(recipe.automation.pauseReason, /input|approval/);
  },
);
test(
  "two independent work tabs can progress concurrently with only the two configured model roles",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const f = await companyFixture(process.env.TEST_DATABASE_URL);
    t.after(() => f.close());
    const settings = { ...defaultCompanySettings(), revision: 0 };
    settings.policy.allowPaid = true;
    await f.json("company/settings", settings, "PUT");
    await f.setSecret("company_ai_assistant_gemini", { key: "fixture" });
    await f.setSecret("company_ai_director_gemini", { key: "fixture" });
    await f.json(
      "company/connections/odssg_vn",
      {
        kind: "odbc",
        name: "odssg_vn",
        baseUrl: "https://gateway.fixture",
        secret: { key: "fixture-token" },
      },
      "PUT",
    );
    f.state.slow = true;
    const a = await f.json("company/messages", {
        requestId: randomUUID(),
        text: "Export the first 10-ADU8 report.",
      }),
      b = await f.json("company/messages", {
        requestId: randomUUID(),
        text: "Export a separate 10-ADU8 report.",
      });
    const [first, second] = await Promise.all([
      f.settle(a.value.job.id, "completed"),
      f.settle(b.value.job.id, "completed"),
    ]);
    assert.notEqual(first.id, second.id);
    assert.equal(f.state.peakModels, 2);
    assert.equal(f.state.queries, 2);
    assert.equal(first.result.files.length, 1);
    assert.equal(second.result.files.length, 1);
  },
);
