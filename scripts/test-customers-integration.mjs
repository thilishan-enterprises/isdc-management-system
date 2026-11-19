import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { Client } from "pg";
import {
  validateCiDatabaseConfiguration,
  validateCiServerIdentity,
} from "./ci-database-safety.mjs";
import "dotenv/config";

const testUrlText = process.env.TEST_DATABASE_URL;
if (!testUrlText) throw new Error("TEST_DATABASE_URL is required; DATABASE_URL is never used as a fallback.");
if (testUrlText === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL.");

const testUrl = new URL(testUrlText);
const databaseName = testUrl.pathname.slice(1);
const localInstanceName = process.env.TEST_DATABASE_INSTANCE_NAME ?? "";
const ciMode = process.env.CI === "true";
const localInstanceMode = /^customers-phase4a-(?:test|ci|tmp)[a-z0-9-]*$/i.test(localInstanceName);
let adminUrl;
if (ciMode) {
  const ciConfiguration = validateCiDatabaseConfiguration(process.env);
  if (ciConfiguration.databaseName !== databaseName) {
    throw new Error("Phase 4A CI database identity does not match its URL.");
  }
  adminUrl = ciConfiguration.adminUrl;
} else {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(testUrl.hostname)) {
    throw new Error("Refusing integration tests: only a local disposable PostgreSQL host is allowed.");
  }
  if (!localInstanceMode && !/^customers_phase4a_(?:test|ci|tmp)[a-z0-9_]*$/i.test(databaseName)) {
    throw new Error("Refusing integration tests: neither database nor local instance is explicitly marked for Phase 4A testing.");
  }
  adminUrl = new URL(testUrl);
  adminUrl.pathname = "/template1";
}
const admin = new Client({ connectionString: adminUrl.toString() });
let databaseCreated = false;

const qid = (value) => `"${value.replaceAll('"', '""')}"`;
const id = (() => { let value = 0; return (prefix) => `${prefix}-${process.pid}-${++value}`; })();
async function dbClient() {
  const client = new Client({ connectionString: testUrl.toString() });
  await client.connect();
  return client;
}

async function expectPgError(promise, code, constraint) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    if (constraint) assert.equal(error.constraint, constraint);
    return true;
  });
}

async function insertCustomer(client, values = {}) {
  const customer = {
    id: values.id ?? id("customer"),
    fullName: values.fullName ?? "Integration Customer",
    nic: values.nic ?? String(200000000000 + Math.floor(Math.random() * 99999999)).padStart(12, "0"),
    mobile: values.mobile ?? `077${String(Math.floor(Math.random() * 10_000_000)).padStart(7, "0")}`,
    additionalMobile: values.additionalMobile ?? null,
    address: values.address ?? id("address"),
  };
  await client.query(
    `INSERT INTO "Customer" ("id", "fullName", "nic", "mobile", "additionalMobile", "address", "updatedAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
    [customer.id, customer.fullName, customer.nic, customer.mobile, customer.additionalMobile, customer.address],
  );
  return customer;
}

async function assertRegistryConsistent(client) {
  const result = await client.query(`
    SELECT
      (SELECT count(*)::int FROM "CustomerPhone") AS registry,
      (SELECT (count(*) + count("additionalMobile") FILTER (WHERE NULLIF(btrim("additionalMobile"), '') IS NOT NULL))::int FROM "Customer") AS expected,
      (SELECT count(*)::int FROM "CustomerPhone" p LEFT JOIN "Customer" c ON c.id = p."customerId" WHERE c.id IS NULL) AS orphaned
  `);
  assert.equal(result.rows[0].registry, result.rows[0].expected);
  assert.equal(result.rows[0].orphaned, 0);
}

async function reserveApproval(client, actorId, clock) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`customer-admin-approval:${actorId}`]);
    const count = await client.query(
      `SELECT count(*)::int AS count FROM "AuditLog" WHERE "userId"=$1 AND action IN ('CUSTOMER_ADMIN_APPROVAL_ATTEMPT','CUSTOMER_ADMIN_APPROVAL_FAILED') AND "createdAt" >= COALESCE($2::timestamp, CURRENT_TIMESTAMP - interval '15 minutes')`,
      [actorId, clock ? new Date(clock.getTime() - 15 * 60_000) : null],
    );
    if (count.rows[0].count >= 5) { await client.query("ROLLBACK"); return null; }
    const attemptId = id("audit");
    await client.query(
      `INSERT INTO "AuditLog" (id, "userId", action, "entityType", "entityId", reason) VALUES ($1,$2,'CUSTOMER_ADMIN_APPROVAL_ATTEMPT','Security',$2,'Customer mutation administrator approval attempted')`,
      [attemptId, actorId],
    );
    await client.query("COMMIT");
    return attemptId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  await admin.connect();

  if (ciMode) {
    const identity = await admin.query(`
      SELECT
        current_database() AS database,
        current_user AS username,
        current_setting('server_version_num')::integer AS server_version_num,
        pg_is_in_recovery() AS in_recovery,
        role.rolcreatedb AS can_create_database
      FROM pg_roles AS role
      WHERE role.rolname = current_user
    `);
    validateCiServerIdentity(identity.rows[0]);

    const preflight = await dbClient();
    try {
      const existingSchema = await preflight.query(`SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename IN ('Customer','_prisma_migrations') LIMIT 1`);
      if (existingSchema.rowCount) throw new Error("Disposable CI database is not empty; refusing to reuse unknown state.");
    } finally {
      await preflight.end();
    }
  } else if (localInstanceMode) {
    const identity = await admin.query("SELECT current_database(), inet_server_addr()::text AS address");
    assert.equal(identity.rows[0].current_database, "template1");
    assert.ok(["127.0.0.1", "::1", null].includes(identity.rows[0].address));
    assert.equal(databaseName, "template1", "local Prisma Postgres tests must use their dedicated instance database");
    const existingSchema = await admin.query(`SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename IN ('Customer','_prisma_migrations') LIMIT 1`);
    if (existingSchema.rowCount) throw new Error("Disposable local instance is not empty; refusing to reuse unknown state.");
  } else {
    assert.equal((await admin.query("SELECT current_database() AS name")).rows[0].name, "template1");
    const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [databaseName]);
    if (existing.rowCount) throw new Error("Disposable test database already exists; refusing to reuse unknown state.");
    await admin.query(`CREATE DATABASE ${qid(databaseName)} TEMPLATE template0`);
    databaseCreated = true;
  }

  const migrationProgram = process.platform === "win32" ? process.env.ComSpec : "npm";
  const migrationArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm.cmd exec prisma -- migrate deploy --config prisma7.config.ts"]
    : ["exec", "prisma", "--", "migrate", "deploy", "--config", "prisma7.config.ts"];
  execFileSync(migrationProgram, migrationArgs, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const db = await dbClient();
  try {
    assert.equal((await db.query("SELECT current_database() AS name")).rows[0].name, databaseName);
    const migrations = await db.query(`SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`);
    assert.equal(migrations.rows[0].count, 11);
    const tables = await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[])`, [["Customer", "CustomerPhone", "ImportJob", "AuditLog", "Sale"]]);
    assert.equal(tables.rowCount, 5);
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM "Customer"`)).rows[0].count, 0, "fresh migrated test database must not contain customers");

    const adminUser = id("admin");
    const staffUser = id("staff");
    const disabledUser = id("disabled");
    const employee = id("employee");
    const disabledEmployee = id("employee");
    await db.query(`INSERT INTO "Employee" (id,"fullName","isActive","updatedAt") VALUES ($1,'Active Employee',true,NOW()),($2,'Disabled Employee',false,NOW())`, [employee, disabledEmployee]);
    await db.query(`INSERT INTO "User" (id,username,"passwordHash",role,"isActive","employeeId","updatedAt") VALUES ($1,$2,'hash','ADMIN',true,NULL,NOW()),($3,$4,'hash','STAFF',true,$5,NOW()),($6,$7,'hash','STAFF',false,NULL,NOW()),($8,$9,'hash','STAFF',true,$10,NOW())`, [adminUser,id("admin-name"),staffUser,id("staff-name"),employee,disabledUser,id("disabled-name"),id("disabled-employee-user"),id("disabled-employee-name"),disabledEmployee]);

    const first = await insertCustomer(db, { nic: "200000000001", mobile: "0771000001", additionalMobile: "0711000001" });
    let phones = await db.query(`SELECT type,"normalizedPhone" FROM "CustomerPhone" WHERE "customerId"=$1 ORDER BY type`, [first.id]);
    assert.deepEqual(phones.rows, [{ type: "PRIMARY", normalizedPhone: "0771000001" }, { type: "ADDITIONAL", normalizedPhone: "0711000001" }]);
    await expectPgError(insertCustomer(db, { nic: first.nic, mobile: "0771000002" }), "23505", "Customer_nic_key");
    await expectPgError(insertCustomer(db, { nic: "200000000002", mobile: first.mobile }), "23505");
    await expectPgError(insertCustomer(db, { nic: "200000000003", mobile: "0771000003", additionalMobile: first.mobile }), "23505", "CustomerPhone_normalizedPhone_key");
    await expectPgError(insertCustomer(db, { nic: "200000000004", mobile: "0771000004", additionalMobile: first.additionalMobile }), "23505", "CustomerPhone_normalizedPhone_key");
    await expectPgError(insertCustomer(db, { nic: "200000000005", mobile: "0771000005", additionalMobile: "0771000005" }), "23505", "CustomerPhone_normalizedPhone_key");
    await expectPgError(insertCustomer(db, { nic: "200000000006", mobile: "999" }), "23514", "CustomerPhone_format_check");

    await db.query(`UPDATE "Customer" SET mobile='0771000006', "additionalMobile"=NULL, "updatedAt"=NOW() WHERE id=$1`, [first.id]);
    phones = await db.query(`SELECT type,"normalizedPhone" FROM "CustomerPhone" WHERE "customerId"=$1`, [first.id]);
    assert.deepEqual(phones.rows, [{ type: "PRIMARY", normalizedPhone: "0771000006" }]);

    await db.query("BEGIN");
    const rollbackCustomer = await insertCustomer(db, { nic: "200000000007", mobile: "0771000007" });
    await db.query("ROLLBACK");
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM "Customer" WHERE id=$1`, [rollbackCustomer.id])).rows[0].count, 0);

    const deletable = await insertCustomer(db, { nic: "200000000008", mobile: "0771000008" });
    await db.query(`DELETE FROM "Customer" WHERE id=$1`, [deletable.id]);
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM "CustomerPhone" WHERE "customerId"=$1`, [deletable.id])).rows[0].count, 0);
    const protectedCustomer = await insertCustomer(db, { nic: "200000000009", mobile: "0771000009" });
    await db.query(`INSERT INTO "Sale" (id,"billNumber","customerId","totalAmount","advancePayment","updatedAt") VALUES ($1,$2,$3,100,0,NOW())`, [id("sale"),id("bill"),protectedCustomer.id]);
    await expectPgError(db.query(`DELETE FROM "Customer" WHERE id=$1`, [protectedCustomer.id]), "23503");

    const c1 = await dbClient(); const c2 = await dbClient();
    try {
      const creates = await Promise.allSettled([
        insertCustomer(c1, { nic: "200000000010", mobile: "0771000010" }),
        insertCustomer(c2, { nic: "200000000011", mobile: "0771000011", additionalMobile: "0771000010" }),
      ]);
      assert.equal(creates.filter((result) => result.status === "fulfilled").length, 1);
      const editA = await insertCustomer(db, { nic: "200000000012", mobile: "0771000012" });
      const editB = await insertCustomer(db, { nic: "200000000013", mobile: "0771000013" });
      const edits = await Promise.allSettled([
        c1.query(`UPDATE "Customer" SET mobile='0771000014',"updatedAt"=NOW() WHERE id=$1`, [editA.id]),
        c2.query(`UPDATE "Customer" SET "additionalMobile"='0771000014',"updatedAt"=NOW() WHERE id=$1`, [editB.id]),
      ]);
      assert.equal(edits.filter((result) => result.status === "fulfilled").length, 1);
    } finally { await c1.end(); await c2.end(); }
    await assertRegistryConsistent(db);

    const readyJob = id("job");
    await db.query(`INSERT INTO "ImportJob" (id,"sessionKey",module,"payloadDigest","originalFilename","uploadedRowCount","candidateRows","totalBatches","initiatedByUserId","updatedAt") VALUES ($1,$2,'CUSTOMERS',$3,'safe.xlsx',3,'[2,3,4]'::jsonb,1,$4,NOW())`, [readyJob,id("session"),"a".repeat(64),staffUser]);
    assert.equal((await db.query(`SELECT status FROM "ImportJob" WHERE id=$1`, [readyJob])).rows[0].status, "READY");
    const claim1 = await dbClient(); const claim2 = await dbClient();
    try {
      const claims = await Promise.all([
        claim1.query(`UPDATE "ImportJob" SET status='PROCESSING',"leaseToken"=$2,"leaseExpiresAt"=NOW()+interval '2 minutes',"attemptCount"="attemptCount"+1,"updatedAt"=NOW() WHERE id=$1 AND status='READY'`, [readyJob,id("lease")]),
        claim2.query(`UPDATE "ImportJob" SET status='PROCESSING',"leaseToken"=$2,"leaseExpiresAt"=NOW()+interval '2 minutes',"attemptCount"="attemptCount"+1,"updatedAt"=NOW() WHERE id=$1 AND status='READY'`, [readyJob,id("lease")]),
      ]);
      assert.equal(claims.reduce((sum, result) => sum + result.rowCount, 0), 1);
    } finally { await claim1.end(); await claim2.end(); }

    const lease = (await db.query(`SELECT "leaseToken" FROM "ImportJob" WHERE id=$1`, [readyJob])).rows[0].leaseToken;
    await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    try {
      await insertCustomer(db, { nic: "200000000020", mobile: "0771000020" });
      const advanced = await db.query(`UPDATE "ImportJob" SET "importedCount"="importedCount"+1,"nextBatchIndex"="nextBatchIndex"+1,"updatedAt"=NOW() WHERE id=$1 AND status='PROCESSING' AND "leaseToken"=$2 AND "nextBatchIndex"=0`, [readyJob, lease]);
      assert.equal(advanced.rowCount, 1);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    const repeat = await db.query(`UPDATE "ImportJob" SET "importedCount"="importedCount"+1 WHERE id=$1 AND status='PROCESSING' AND "leaseToken"=$2 AND "nextBatchIndex"=0`, [readyJob, lease]);
    assert.equal(repeat.rowCount, 0);
    await db.query(`UPDATE "ImportJob" SET status='COMPLETED',"completedAt"=NOW(),"leaseToken"=NULL,"leaseExpiresAt"=NULL,"updatedAt"=NOW() WHERE id=$1`, [readyJob]);
    assert.equal((await db.query(`UPDATE "ImportJob" SET status='PROCESSING' WHERE id=$1 AND status='READY'`, [readyJob])).rowCount, 0);

    const partialJob = id("job");
    await db.query(`INSERT INTO "ImportJob" (id,"sessionKey",module,"payloadDigest","originalFilename","uploadedRowCount","importedCount","skippedCount","invalidCount","duplicateCount",status,"candidateRows","initiatedByUserId","updatedAt") VALUES ($1,$2,'CUSTOMERS',$3,'partial.csv',4,1,3,1,2,'PARTIAL','[2]'::jsonb,$4,NOW())`, [partialJob,id("session"),"b".repeat(64),staffUser]);
    const partial = (await db.query(`SELECT "uploadedRowCount","importedCount","skippedCount","invalidCount","duplicateCount","failedCount" FROM "ImportJob" WHERE id=$1`, [partialJob])).rows[0];
    assert.deepEqual(partial, { uploadedRowCount: 4, importedCount: 1, skippedCount: 3, invalidCount: 1, duplicateCount: 2, failedCount: 0 });

    const activeJob = id("job"); const recoverableJob = id("job"); const staleJob = id("job"); const abandonedJob = id("job");
    for (const [jobId, status, leaseOffset, createdOffset] of [
      [activeJob,"PROCESSING","1 minute","0 minutes"],
      [recoverableJob,"PROCESSING","-10 minutes","0 minutes"],
      [staleJob,"PROCESSING","-31 minutes","0 minutes"],
      [abandonedJob,"READY",null,"-31 minutes"],
    ]) {
      await db.query(`INSERT INTO "ImportJob" (id,"sessionKey",module,"payloadDigest","originalFilename","uploadedRowCount",status,"candidateRows","totalBatches","leaseToken","leaseExpiresAt","createdAt","initiatedByUserId","updatedAt") VALUES ($1,$2,'CUSTOMERS',$3,'recovery.csv',2,$4,'[2,3]'::jsonb,1,$5,CASE WHEN $6::text IS NULL THEN NULL ELSE NOW()+($6::text)::interval END,NOW()+($7::text)::interval,$8,NOW()+($7::text)::interval)`, [jobId,id("session"),"c".repeat(64),status,status === "PROCESSING" ? id("lease") : null,leaseOffset,createdOffset,staffUser]);
    }
    const recoverClaim = await db.query(`UPDATE "ImportJob" SET "leaseToken"=$2,"leaseExpiresAt"=NOW()+interval '2 minutes',"attemptCount"="attemptCount"+1,"updatedAt"=NOW() WHERE id=$1 AND status='PROCESSING' AND "leaseExpiresAt" <= NOW()`, [recoverableJob,id("lease")]);
    assert.equal(recoverClaim.rowCount, 1);
    const interrupted = await db.query(`UPDATE "ImportJob" SET status='FAILED',"failedCount"="failedCount"+2,"failureCode"='IMPORT_INTERRUPTED',"completedAt"=NOW(),"leaseToken"=NULL,"leaseExpiresAt"=NULL,"updatedAt"=NOW() WHERE id=$1 AND status='PROCESSING' AND "leaseExpiresAt" < NOW()-interval '30 minutes'`, [staleJob]);
    assert.equal(interrupted.rowCount, 1);
    assert.equal((await db.query(`UPDATE "ImportJob" SET status='FAILED' WHERE id=$1 AND status='PROCESSING' AND "leaseExpiresAt" < NOW()-interval '30 minutes'`, [activeJob])).rowCount, 0);
    const expired = await db.query(`UPDATE "ImportJob" SET status='FAILED',"failedCount"=2,"failureCode"='PREVIEW_EXPIRED',"completedAt"=NOW(),"updatedAt"=NOW() WHERE id=$1 AND status='READY' AND "createdAt" < NOW()-interval '30 minutes'`, [abandonedJob]);
    assert.equal(expired.rowCount, 1);

    const defaultIsolation = await db.query("SHOW default_transaction_isolation");
    assert.equal(defaultIsolation.rows[0].default_transaction_isolation, "read committed");

    await db.query(`INSERT INTO "AuditLog" (id,"userId",action,"entityType","entityId",reason,"createdAt") VALUES ($1,$2,'CUSTOMER_ADMIN_APPROVAL_FAILED','Security',$2,'Customer mutation administrator approval failed',CURRENT_TIMESTAMP-interval '16 minutes')`, [id("audit"), staffUser]);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const attemptId = await reserveApproval(db, staffUser);
      assert.ok(attemptId);
      await db.query(`UPDATE "AuditLog" SET action='CUSTOMER_ADMIN_APPROVAL_FAILED',reason='Customer mutation administrator approval failed' WHERE id=$1`, [attemptId]);
    }
    assert.equal(await reserveApproval(db, staffUser), null);

    const concurrentActor = id("staff");
    await db.query(`INSERT INTO "User" (id,username,"passwordHash",role,"isActive","updatedAt") VALUES ($1,$2,'hash','STAFF',true,NOW())`, [concurrentActor,id("staff-name")]);
    const approvalClients = await Promise.all(Array.from({ length: 8 }, () => dbClient()));
    try {
      const attempts = await Promise.all(approvalClients.map((client) => reserveApproval(client, concurrentActor)));
      assert.equal(attempts.filter(Boolean).length, 5);
      await Promise.all(attempts.map((attemptId, index) =>
        attemptId
          ? approvalClients[index].query(
              `UPDATE "AuditLog" SET action='CUSTOMER_ADMIN_APPROVAL_FAILED',reason='Customer mutation administrator approval failed' WHERE id=$1 AND "userId"=$2 AND action='CUSTOMER_ADMIN_APPROVAL_ATTEMPT'`,
              [attemptId, concurrentActor],
            )
          : Promise.resolve(),
      ));
      const auditCounts = await db.query(
        `SELECT action,count(*)::int AS count FROM "AuditLog" WHERE "userId"=$1 GROUP BY action ORDER BY action`,
        [concurrentActor],
      );
      assert.deepEqual(auditCounts.rows, [
        { action: "CUSTOMER_ADMIN_APPROVAL_FAILED", count: 5 },
      ]);
      const unauthorizedDeletes = await db.query(
        `SELECT count(*)::int AS count FROM "AuditLog" WHERE "userId"=$1 AND action='CUSTOMER_DELETED'`,
        [concurrentActor],
      );
      assert.equal(unauthorizedDeletes.rows[0].count, 0);
    } finally { await Promise.all(approvalClients.map((client) => client.end())); }

    const successActor = id("staff");
    await db.query(`INSERT INTO "User" (id,username,"passwordHash",role,"isActive","updatedAt") VALUES ($1,$2,'hash','STAFF',true,NOW())`, [successActor,id("staff-name")]);
    const successAttempt = await reserveApproval(db, successActor);
    await db.query(`UPDATE "AuditLog" SET action='CUSTOMER_ADMIN_APPROVAL_SUCCEEDED',reason='Customer mutation administrator approval succeeded' WHERE id=$1`, [successAttempt]);
    assert.ok(await reserveApproval(db, successActor));
    const auditText = JSON.stringify((await db.query(`SELECT action,"entityType",reason,"beforeData","afterData" FROM "AuditLog" WHERE "userId"=$1`, [successActor])).rows);
    assert.doesNotMatch(auditText, /password|passwordHash|admin-name/i);

    const access = await db.query(`SELECT u.id,u."isActive",COALESCE(e."isActive",true) AS employee_active FROM "User" u LEFT JOIN "Employee" e ON e.id=u."employeeId" WHERE u.id = ANY($1::text[])`, [[adminUser,staffUser,disabledUser]]);
    assert.equal(access.rows.find((row) => row.id === adminUser).isActive, true);
    assert.equal(access.rows.find((row) => row.id === staffUser).employee_active, true);
    assert.equal(access.rows.find((row) => row.id === disabledUser).isActive, false);

    await assertRegistryConsistent(db);
    console.log("PASS Customers PostgreSQL integration tests (CRUD, registry, import state, concurrency, approval throttle)");
  } finally {
    await db.end();
  }
}

try {
  await main();
} finally {
  if (admin._connected && databaseCreated) {
    await admin.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()`, [databaseName]);
    await admin.query(`DROP DATABASE IF EXISTS ${qid(databaseName)}`);
  }
  if (admin._connected) await admin.end();
}
