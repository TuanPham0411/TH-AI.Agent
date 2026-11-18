import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { driveFirstPool } from "../server/th-storage/client.mjs";
import { CompanyStore } from "../server/company-v2-store.js";
test(
  "new company domain is captured by Drive-first storage after repeat migration; unacknowledged writes roll back",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const admin = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    await admin.connect();
    const name = "company_capture_" + randomUUID().replaceAll("-", ""),
      url = new URL(process.env.TEST_DATABASE_URL);
    url.pathname = "/" + name;
    let pool;
    try {
      await admin.query("CREATE DATABASE " + name);
      const env = { ...process.env, DATABASE_URL: url.href };
      execFileSync(process.execPath, ["server/migrate.js"], { env });
      pool = new pg.Pool({ connectionString: url.href, max: 2 });
      await pool.query(await readFile("server/th-storage/capture.sql", "utf8"));
      await pool.query("UPDATE th_storage.head SET enforced=true");
      execFileSync(process.execPath, ["server/migrate.js"], {
        env: { ...env, PGOPTIONS: "-c th_storage.authorized=1" },
      });
      await assert.rejects(
        pool.query("INSERT INTO company_settings(id,value) VALUES(true,$1)", [
          {},
        ]),
        /Central Drive/,
      );
      let head = null,
        deny = false;
      const tables = new Set(),
        wrapped = driveFirstPool(pool, {
          checkHead: async (expected) => assert.equal(expected, head),
          commit: async (operation) => {
            if (deny) throw Error("Fixture Drive unavailable");
            for (const e of operation.events) tables.add(e.table);
            head = operation.id;
            return { id: operation.id, committed: true };
          },
        });
      const store = new CompanyStore(wrapped);
      await wrapped.query(
        "INSERT INTO company_settings(id,value) VALUES(true,$1)",
        [{ version: 2 }],
      );
      const job = (
        await store.enqueue({
          requestId: randomUUID(),
          text: "Keep this request durable.",
        })
      ).job;
      assert((await store.get(job.id)).request.includes("durable"));
      await wrapped.query(
        "INSERT INTO company_connections(id,value) VALUES($1,$2)",
        ["odssg_vn", { kind: "odbc" }],
      );
      await wrapped.query(
        "INSERT INTO company_recipes(id,value) VALUES($1,$2)",
        [randomUUID(), { title: "query recipe" }],
      );
      for (const table of [
        "company_settings",
        "company_jobs",
        "company_messages",
        "company_connections",
        "company_recipes",
      ])
        assert(tables.has(table), "Missing durable capture for " + table);
      deny = true;
      await assert.rejects(
        store.enqueue({
          requestId: randomUUID(),
          text: "This must not survive",
        }),
        /Drive/,
      );
      assert.equal(
        Number(
          (await pool.query("SELECT count(*) FROM company_jobs")).rows[0].count,
        ),
        1,
      );
    } finally {
      await pool?.end();
      await admin.query("DROP DATABASE IF EXISTS " + name);
      await admin.end();
    }
  },
);
