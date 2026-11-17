import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { Client } from "pg";
import "dotenv/config";

const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  console.log(
    "SKIP customer phone registry integration tests: TEST_DATABASE_URL is not configured.",
  );
  process.exit(0);
}

if (testUrl === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL.");
}

const parsedUrl = new URL(testUrl);
const databaseName = parsedUrl.pathname.slice(1);
if (!/(test|ci|disposable|temporary|tmp)/i.test(databaseName)) {
  throw new Error(
    "Refusing integration tests: the disposable database name must contain test, ci, disposable, temporary, or tmp.",
  );
}

const schema = `phone_registry_test_${process.pid}_${Date.now()}`;
const quotedSchema = `"${schema}"`;
const productionMigrationSql = await readFile(
  new URL(
    "../prisma/migrations/20261118150000_add_customer_phone_registry/migration.sql",
    import.meta.url,
  ),
  "utf8",
);
const migrationSql = productionMigrationSql
  .replaceAll('"public".', `${quotedSchema}.`)
  .replace(
    "SET search_path = pg_catalog, public",
    `SET search_path = pg_catalog, ${schema}`,
  );

function client() {
  return new Client({ connectionString: testUrl });
}

async function connectInSchema() {
  const db = client();
  await db.connect();
  await db.query(`SET search_path TO ${quotedSchema}`);
  return db;
}

async function expectDatabaseError(promise, code, constraint) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    if (constraint) assert.equal(error.constraint, constraint);
    return true;
  });
}

const admin = client();
await admin.connect();

try {
  await admin.query(`CREATE SCHEMA ${quotedSchema}`);
  await admin.query(`SET search_path TO ${quotedSchema}`);
  await admin.query(`
    CREATE TABLE "Customer" (
      "id" TEXT PRIMARY KEY,
      "mobile" TEXT NOT NULL UNIQUE,
      "additionalMobile" TEXT
    )
  `);
  await admin.query(`
    INSERT INTO "Customer" ("id", "mobile", "additionalMobile") VALUES
      ('legacy-valid', '0771000001', '0711000001'),
      ('legacy-invalid', '123', '456')
  `);

  await admin.query(migrationSql);

  const backfill = await admin.query(`
    SELECT "customerId", "type", "normalizedPhone"
    FROM "CustomerPhone"
    ORDER BY "customerId", "type"
  `);
  assert.equal(backfill.rowCount, 4);
  assert.ok(
    backfill.rows.some(
      (row) =>
        row.customerId === "legacy-invalid" && row.normalizedPhone === "123",
    ),
  );

  await admin.query(`
    INSERT INTO "Customer" ("id", "mobile", "additionalMobile")
    VALUES ('primary-owner', '0772000001', NULL)
  `);

  await expectDatabaseError(
    admin.query(`
      INSERT INTO "Customer" ("id", "mobile", "additionalMobile")
      VALUES ('primary-primary-conflict', '0772000001', NULL)
    `),
    "23505",
  );
  await expectDatabaseError(
    admin.query(`
      INSERT INTO "Customer" ("id", "mobile", "additionalMobile")
      VALUES ('primary-additional-conflict', '0772000002', '0772000001')
    `),
    "23505",
    "CustomerPhone_normalizedPhone_key",
  );

  await admin.query(`
    INSERT INTO "Customer" ("id", "mobile", "additionalMobile")
    VALUES ('additional-owner', '0772000003', '0712000003')
  `);
  await expectDatabaseError(
    admin.query(`
      INSERT INTO "Customer" ("id", "mobile", "additionalMobile")
      VALUES ('additional-additional-conflict', '0772000004', '0712000003')
    `),
    "23505",
    "CustomerPhone_normalizedPhone_key",
  );
  await expectDatabaseError(
    admin.query(`
      INSERT INTO "Customer" ("id", "mobile", "additionalMobile")
      VALUES ('identical-fields', '0772000005', '0772000005')
    `),
    "23505",
    "CustomerPhone_normalizedPhone_key",
  );
  await expectDatabaseError(
    admin.query(`
      INSERT INTO "Customer" ("id", "mobile", "additionalMobile")
      VALUES ('invalid-new-phone', '999', NULL)
    `),
    "23514",
    "CustomerPhone_format_check",
  );

  await admin.query(`
    UPDATE "Customer"
    SET "mobile" = '0772000006', "additionalMobile" = NULL
    WHERE "id" = 'additional-owner'
  `);
  const changedPhones = await admin.query(`
    SELECT "type", "normalizedPhone"
    FROM "CustomerPhone"
    WHERE "customerId" = 'additional-owner'
  `);
  assert.deepEqual(changedPhones.rows, [
    { type: "PRIMARY", normalizedPhone: "0772000006" },
  ]);

  await admin.query("BEGIN");
  await admin.query(`
    INSERT INTO "Customer" ("id", "mobile", "additionalMobile")
    VALUES ('rolled-back', '0772000007', NULL)
  `);
  await admin.query("ROLLBACK");
  const rolledBack = await admin.query(`
    SELECT count(*)::int AS count FROM "CustomerPhone"
    WHERE "customerId" = 'rolled-back'
  `);
  assert.equal(rolledBack.rows[0].count, 0);

  const first = await connectInSchema();
  const second = await connectInSchema();
  try {
    const concurrent = await Promise.allSettled([
      first.query(`
        INSERT INTO "Customer" ("id", "mobile", "additionalMobile")
        VALUES ('concurrent-a', '0773000001', NULL)
      `),
      second.query(`
        INSERT INTO "Customer" ("id", "mobile", "additionalMobile")
        VALUES ('concurrent-b', '0773000009', '0773000001')
      `),
    ]);
    assert.equal(
      concurrent.filter((result) => result.status === "fulfilled").length,
      1,
    );
    assert.equal(
      concurrent.filter((result) => result.status === "rejected").length,
      1,
    );

    await first.query(`
      INSERT INTO "Customer" ("id", "mobile", "additionalMobile") VALUES
        ('edit-a', '0773000002', NULL),
        ('edit-b', '0773000003', NULL)
    `);
    const edits = await Promise.allSettled([
      first.query(`UPDATE "Customer" SET "mobile" = '0773000004' WHERE "id" = 'edit-a'`),
      second.query(`UPDATE "Customer" SET "additionalMobile" = '0773000004' WHERE "id" = 'edit-b'`),
    ]);
    assert.equal(edits.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(edits.filter((result) => result.status === "rejected").length, 1);
  } finally {
    await first.end();
    await second.end();
  }

  await expectDatabaseError(
    admin.query(`
      INSERT INTO "Customer" ("id", "mobile", "additionalMobile") VALUES
        ('bulk-a', '0774000001', NULL),
        ('bulk-b', '0772000001', NULL)
    `),
    "23505",
  );
  const partialBulk = await admin.query(`
    SELECT count(*)::int AS count FROM "Customer"
    WHERE "id" IN ('bulk-a', 'bulk-b')
  `);
  assert.equal(partialBulk.rows[0].count, 0);

  const registryCount = await admin.query(`
    SELECT count(*)::int AS count FROM "CustomerPhone"
  `);
  const sourceCount = await admin.query(`
    SELECT count(*)::int + count("additionalMobile") FILTER (
      WHERE NULLIF(btrim("additionalMobile"), '') IS NOT NULL
    )::int AS count
    FROM "Customer"
  `);
  assert.equal(registryCount.rows[0].count, sourceCount.rows[0].count);

  console.log("PASS customer phone registry PostgreSQL integration tests");
} finally {
  try {
    await admin.query("ROLLBACK");
  } catch {}
  await admin.query(`DROP SCHEMA IF EXISTS ${quotedSchema} CASCADE`);
  await admin.end();
}
