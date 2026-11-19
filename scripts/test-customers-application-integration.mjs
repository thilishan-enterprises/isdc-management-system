import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import process from "node:process";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import {
  encodeReply,
} from "next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.node.production.js";
import "dotenv/config";

const testUrlText = process.env.TEST_DATABASE_URL;
const instanceName = process.env.TEST_DATABASE_INSTANCE_NAME ?? "";
if (!testUrlText) throw new Error("TEST_DATABASE_URL is required and has no fallback.");
if (testUrlText === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL.");
const testUrl = new URL(testUrlText);
const ciMode = process.env.CI === "true";
const databaseName = testUrl.pathname.slice(1);
const validCiDatabase = /^customers_phase4b_[a-z0-9_]*test$/i.test(databaseName);
if (
  !ciMode &&
  !/^customers-phase4b-(?:test|ci|tmp|diagnostic)[a-z0-9-]*$/i.test(instanceName)
) {
  throw new Error("A verified Phase 4B local instance name is required.");
}
if (!["localhost", "127.0.0.1", "::1"].includes(testUrl.hostname)) throw new Error("Phase 4B requires a loopback disposable PostgreSQL host.");
if (ciMode ? !validCiDatabase : testUrl.pathname !== "/template1") throw new Error("Phase 4B database identity is not an approved disposable target.");

const port = Number.parseInt(process.env.PHASE4B_TEST_PORT ?? "3419", 10);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("PHASE4B_TEST_PORT must be a valid non-privileged port.");
}
const origin = `http://127.0.0.1:${port}`;
const authSecret = "phase4b-auth-secret-isolated-tests-only-2026";
const importSecret = "phase4b-import-secret-isolated-tests-only-2026";
const db = new Client({
  connectionString: testUrl.toString(),
  connectionTimeoutMillis: 10_000,
  query_timeout: 15_000,
});
let server;
let shutdownPromise;
let activeStage;
let stageTimer;
const safeServerDiagnostics = [];
let sequence = 0;
const unique = (prefix) => `${prefix}-${process.pid}-${++sequence}`;

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function stopServer() {
  if (!server?.pid) return;

  const closed = new Promise((resolve) => {
    if (server.exitCode !== null) resolve();
    else server.once("close", resolve);
  });

  if (process.platform === "win32") {
    try {
      execFileSync(
        "taskkill.exe",
        ["/pid", String(server.pid), "/t", "/f"],
        { stdio: "ignore" },
      );
    } catch {}
  } else {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {}
    await Promise.race([closed, delay(5_000)]);
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {}
    await Promise.race([closed, delay(2_000)]);
  }

  server.stdout?.destroy();
  server.stderr?.destroy();
}

function shutdownResources() {
  shutdownPromise ??= (async () => {
    await stopServer();
    if (db._connected) {
      await Promise.race([
        db.end(),
        delay(5_000).then(() => {
          throw new Error("PostgreSQL test client shutdown timed out.");
        }),
      ]);
    }
  })();
  return shutdownPromise;
}

function clearStageTimer() {
  if (stageTimer) clearTimeout(stageTimer);
  stageTimer = undefined;
}

function startStage(name, timeoutMilliseconds = 120_000) {
  if (activeStage) console.log(`PASS Phase 4B stage: ${activeStage}`);
  clearStageTimer();
  activeStage = name;
  console.log(`START Phase 4B stage: ${name}`);
  stageTimer = setTimeout(() => {
    console.error(`TIMEOUT Phase 4B stage: ${name}`);
    if (safeServerDiagnostics.length) {
      console.error(JSON.stringify({ serverDiagnostics: safeServerDiagnostics }));
    }
    process.exitCode = 1;
    void Promise.race([shutdownResources(), delay(10_000)]).finally(() => {
      process.exit(1);
    });
  }, timeoutMilliseconds);
}

function finishStages() {
  if (activeStage) console.log(`PASS Phase 4B stage: ${activeStage}`);
  activeStage = undefined;
  clearStageTimer();
}

function migrationCommand() {
  if (process.platform === "win32") return [process.env.ComSpec, ["/d", "/s", "/c", "npm.cmd exec prisma -- migrate deploy --config prisma7.config.ts"]];
  return ["npm", ["exec", "prisma", "--", "migrate", "deploy", "--config", "prisma7.config.ts"]];
}

class CookieJar {
  values = new Map();
  absorb(response) {
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator > 0) this.values.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }
  header() { return [...this.values].map(([name, value]) => `${name}=${value}`).join("; "); }
}

async function request(path, options = {}, jar) {
  const headers = new Headers(options.headers);
  if (jar?.header()) headers.set("cookie", jar.header());
  const response = await fetch(`${origin}${path}`, { ...options, headers, redirect: options.redirect ?? "manual", signal: options.signal ?? AbortSignal.timeout(15_000) });
  jar?.absorb(response);
  return response;
}

async function signIn(username, password) {
  const jar = new CookieJar();
  const csrfResponse = await request("/api/auth/csrf", {}, jar);
  assert.equal(csrfResponse.status, 200);
  const { csrfToken } = await csrfResponse.json();
  const response = await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, username, password, callbackUrl: `${origin}/dashboard` }),
  }, jar);
  return { jar, response };
}

async function session(jar) {
  const response = await request("/api/auth/session", {}, jar);
  assert.equal(response.status, 200);
  return response.json();
}

async function waitForServer() {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const response = await fetch(`${origin}/login`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Next.js test server did not become ready.");
}

async function actionManifest() {
  return JSON.parse(await readFile(".next/server/server-reference-manifest.json", "utf8")).node;
}

function actionId(manifest, filename, exportedName) {
  const entry = Object.entries(manifest).find(([, value]) => value.filename === filename && value.exportedName === exportedName);
  if (!entry) throw new Error(`Server action not found: ${exportedName}`);
  const route = Object.keys(entry[1].workers)[0];
  const pathname = route
    .replace(/^app\//, "")
    .replace(/\/page$/, "")
    .replace(/(^|\/)\([^/]+\)/g, "")
    .replace(/^\/+/, "");
  return { id: entry[0], path: `/${pathname}` };
}

async function callAction(manifest, filename, exportedName, args, jar) {
  const action = actionId(manifest, filename, exportedName);
  const body = await encodeReply(args);
  const headers = new Headers({ Accept: "text/x-component", "Next-Action": action.id });
  if (typeof body === "string") headers.set("content-type", "text/plain;charset=UTF-8");
  const response = await request(action.path, { method: "POST", headers, body }, jar);
  const text = await response.clone().text();
  const chunks = new Map();
  for (const line of text.split("\n")) {
    const match = /^(\d+):(.*)$/.exec(line);
    if (!match) continue;
    try { chunks.set(match[1], JSON.parse(match[2])); } catch {}
  }
  const root = chunks.get("0");
  const reference = typeof root?.a === "string" ? /^\$@?(\d+)$/.exec(root.a) : null;
  const value = reference ? chunks.get(reference[1]) : root;
  const digests = [...text.matchAll(/(?:"digest"\s*:\s*"|digest[:=]\s*)([A-Za-z0-9_-]+)/g)].map((match) => match[1]);
  return { response, value, digests };
}

function customerForm(input = {}) {
  const form = new FormData();
  form.set("fullName", input.fullName ?? "Phase Test Customer");
  form.set("nic", input.nic ?? "200000000001");
  form.set("mobile", input.mobile ?? "0771000001");
  form.set("additionalMobile", input.additionalMobile ?? "");
  form.set("address", input.address ?? unique("address"));
  form.set("area", "Test Area");
  form.set("guarantorDetails", "");
  form.set("notes", "");
  return form;
}

let saleIdentitySequence = 100;

async function verifiedSaleForm(
  manifest,
  jar,
  {
    billNumber,
    items,
    advancePayment = "0",
    monthlyInstallmentAmount = "1000",
    saleDate = "2026-01-15",
    firstInstallmentDate = "2026-02-15",
  },
) {
  saleIdentitySequence += 1;
  billNumber ??= String(saleIdentitySequence).padStart(4, "0");
  const suffix = String(saleIdentitySequence).padStart(7, "0");
  const entered = {
    billNumber,
    fullName: `Sale Test Customer ${saleIdentitySequence}`,
    address: `Sale Test Address ${saleIdentitySequence}`,
    nic: String(300_000_000_000 + saleIdentitySequence),
    mobile: `071${suffix}`,
    additionalMobile: "",
  };
  const confirmation = await callAction(
    manifest,
    "src/app/(app)/sales/actions.ts",
    "confirmSaleCustomerRecord",
    [{ entered, selectedCustomerId: null, details: null }],
    jar,
  );
  assert.equal(confirmation.response.status, 200);
  assert.equal(confirmation.value?.success, true, JSON.stringify(confirmation.value));
  assert.ok(confirmation.value?.token);

  const form = new FormData();
  form.set("billNumber", billNumber);
  form.set("fullName", entered.fullName);
  form.set("address", entered.address);
  form.set("nic", entered.nic);
  form.set("mobile", entered.mobile);
  form.set("additionalMobile", "");
  form.set("area", "Sales Test Area");
  form.set("guarantorDetails", "Snapshot guarantor");
  form.set("salesEmployeeId", "");
  form.set("notes", "Sales integration test");
  form.set("items", JSON.stringify(items));
  form.set("advancePayment", advancePayment);
  form.set("monthlyInstallmentAmount", monthlyInstallmentAmount);
  form.set("saleDate", saleDate);
  form.set("firstInstallmentDate", firstInstallmentDate);
  form.set("verificationToken", confirmation.value.token);
  form.set("selectedCustomerId", "");

  return { billNumber, entered, form };
}

function resignImportToken(token, mutate) {
  const [body] = token.split(".");
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  mutate(payload);
  const nextBody = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", importSecret).update(nextBody).digest("hex");
  return `${nextBody}.${signature}`;
}

function importInput(sessionKey, rows) {
  return {
    originalFilename: "phase4b.csv",
    sessionKey,
    headers: ["Full Name", "NIC", "Phone", "Address"],
    rows: rows.map((values, index) => ({ rowNumber: index + 2, values, formulaColumns: [], numericColumns: [] })),
    mapping: { 0: "fullName", 1: "nic", 2: "mobile", 3: "address" },
  };
}

async function main() {
  startStage("database migration and test fixtures");
  await db.connect();
  assert.equal((await db.query("SELECT current_database() AS name")).rows[0].name, ciMode ? databaseName : "template1");
  const dirty = await db.query(`SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename IN ('Customer','_prisma_migrations') LIMIT 1`);
  if (dirty.rowCount) throw new Error("Disposable Phase 4B database is not empty.");

  const [program, args] = migrationCommand();
  execFileSync(program, args, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).rows[0].count, 11);

  const password = "Phase4B-Password-Only";
  const passwordHash = await bcrypt.hash(password, 8);
  const adminId = unique("admin");
  const staffId = unique("staff");
  const disabledId = unique("disabled");
  const disabledEmployeeId = unique("employee");
  const disabledEmployeeUserId = unique("disabled-employee-user");
  const adminName = unique("admin-user");
  const staffName = unique("staff-user");
  const disabledName = unique("disabled-user");
  const disabledEmployeeName = unique("disabled-employee-user");
  await db.query(`INSERT INTO "Employee" (id,"fullName","isActive","updatedAt") VALUES ($1,'Disabled Employee',false,NOW())`, [disabledEmployeeId]);
  await db.query(`INSERT INTO "User" (id,username,"passwordHash",role,"isActive","employeeId","updatedAt") VALUES ($1,$2,$3,'ADMIN',true,NULL,NOW()),($4,$5,$3,'STAFF',true,NULL,NOW()),($6,$7,$3,'STAFF',false,NULL,NOW()),($8,$9,$3,'STAFF',true,$10,NOW())`, [adminId,adminName,passwordHash,staffId,staffName,disabledId,disabledName,disabledEmployeeUserId,disabledEmployeeName,disabledEmployeeId]);

  startStage("Next.js test server startup", 90_000);
  const startProgram = process.platform === "win32" ? process.env.ComSpec : "npm";
  const startArgs = process.platform === "win32" ? ["/d", "/s", "/c", `npm.cmd start -- -p ${port}`] : ["start", "--", "-p", String(port)];
  server = spawn(startProgram, startArgs, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testUrl.toString(), AUTH_SECRET: authSecret, IMPORT_SIGNING_SECRET: importSecret, AUTH_TRUST_HOST: "true", NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  for (const stream of [server.stdout, server.stderr]) {
    stream?.on("data", (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (/Customer administrator approval infrastructure failed\.|\bP20\d{2}\b|SQLSTATE|digest/i.test(line)) {
          safeServerDiagnostics.push(line.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-connection]").slice(0, 500));
        }
      }
    });
  }
  await waitForServer();

  startStage("authentication and anonymous authorization");
  const anonymousSelected = await request("/customers/exports/selected", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: ["missing"] }) });
  assert.equal(anonymousSelected.status, 401);
  assert.deepEqual(await anonymousSelected.json(), { error: "Authentication is required to export selected customers." });
  assert.equal((await request("/customers/import/template")).status, 401);
  const anonymousDirectory = await request("/customers");
  if ([302, 303, 307, 308].includes(anonymousDirectory.status)) {
    assert.match(anonymousDirectory.headers.get("location") ?? "", /\/login/);
  } else {
    assert.equal(anonymousDirectory.status, 200);
    assert.match(await anonymousDirectory.text(), /\/login|NEXT_REDIRECT/);
  }

  const adminLogin = await signIn(adminName, password);
  assert.ok([302, 303].includes(adminLogin.response.status));
  const adminSession = await session(adminLogin.jar);
  assert.equal(adminSession.user.id, adminId);
  assert.equal(adminSession.user.role, "ADMIN");
  const staffLogin = await signIn(staffName, password);
  assert.ok([302, 303].includes(staffLogin.response.status));
  assert.equal((await session(staffLogin.jar)).user.role, "STAFF");
  assert.equal((await signIn(disabledName, password)).jar.values.has("authjs.session-token"), false);
  assert.equal((await signIn(disabledEmployeeName, password)).jar.values.has("authjs.session-token"), false);

  const manifest = await actionManifest();
  if (
    process.env.PHASE4B_DIAGNOSTIC === "1" ||
    process.env.PHASE4B_FOCUSED === "1"
  ) {
    startStage("focused administrator approval concurrency");
    const diagnosticStaffId = unique("diagnostic-staff");
    const diagnosticStaffName = unique("diagnostic-staff-user");
    await db.query(`INSERT INTO "User" (id,username,"passwordHash",role,"isActive","updatedAt") VALUES ($1,$2,$3,'STAFF',true,NOW())`, [diagnosticStaffId, diagnosticStaffName, passwordHash]);
    const diagnosticLogin = await signIn(diagnosticStaffName, password);
    const diagnosticApprovals = await Promise.all(Array.from({ length: 8 }, () =>
      callAction(manifest, "src/app/(app)/customers/management-actions.ts", "deleteCustomers", [{ customerIds: ["missing"], adminPassword: "wrong" }], diagnosticLogin.jar),
    ));
    await new Promise((resolve) => setTimeout(resolve, 100));
    const diagnosticAudit = await db.query(`SELECT action,count(*)::int AS count FROM "AuditLog" WHERE "userId"=$1 GROUP BY action ORDER BY action`, [diagnosticStaffId]);
    const diagnosticDeletes = await db.query(`SELECT count(*)::int AS count FROM "AuditLog" WHERE "userId"=$1 AND action='CUSTOMER_DELETED'`, [diagnosticStaffId]);
    const connectionStates = await db.query(`SELECT state,count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() GROUP BY state ORDER BY state`);
    const report = {
      requests: diagnosticApprovals.map(({ response, value, digests }, index) => ({
        index,
        status: response.status,
        result: value && typeof value === "object" ? { success: value.success, error: value.error, deletedCount: value.deletedCount } : null,
        digests,
      })),
      audit: diagnosticAudit.rows,
      customerDeleteAuditCount: diagnosticDeletes.rows[0].count,
      connectionStates: connectionStates.rows,
      serverDiagnostics: safeServerDiagnostics,
    };
    console.log(JSON.stringify(report));
    if (process.env.PHASE4B_FOCUSED === "1") {
      assert.ok(
        report.requests.every((request) => request.status === 200),
        "Every focused approval request must return a controlled HTTP 200 response.",
      );
      assert.ok(
        report.requests.every(
          (request) =>
            request.result?.success === false &&
            request.result?.error === "Administrator authorization failed." &&
            request.result?.deletedCount === 0 &&
            request.digests.length === 0,
        ),
        "Every focused approval must be rejected without a server-action error digest.",
      );
      assert.deepEqual(report.audit, [
        { action: "CUSTOMER_ADMIN_APPROVAL_FAILED", count: 5 },
      ]);
      assert.equal(report.customerDeleteAuditCount, 0);
      console.log("PASS focused authenticated administrator approval concurrency tests");
    }
    finishStages();
    return;
  }
  startStage("customer registration, editing, and approval throttling");
  const invalid = await callAction(manifest, "src/app/(app)/customers/actions.ts", "createCustomer", [{}, customerForm({ nic: "invalid" })], staffLogin.jar);
  assert.equal(invalid.response.status, 200);
  assert.match(JSON.stringify(invalid.value), /NIC|9 or 12/i);

  const created = await callAction(manifest, "src/app/(app)/customers/actions.ts", "createCustomer", [{}, customerForm()], staffLogin.jar);
  assert.ok([200, 303].includes(created.response.status));
  const customer = (await db.query(`SELECT id,nic,mobile FROM "Customer" WHERE nic='200000000001'`)).rows[0];
  assert.ok(customer);
  const duplicate = await callAction(manifest, "src/app/(app)/customers/actions.ts", "createCustomer", [{}, customerForm({ address: unique("address") })], staffLogin.jar);
  assert.match(JSON.stringify(duplicate.value), /already registered/i);

  const concurrentForms = [
    customerForm({ nic: "200000000002", mobile: "0771000002", address: unique("address") }),
    customerForm({ nic: "200000000003", mobile: "0771000002", address: unique("address") }),
  ];
  await Promise.all(concurrentForms.map((form) => callAction(manifest, "src/app/(app)/customers/actions.ts", "createCustomer", [{}, form], staffLogin.jar)));
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM "CustomerPhone" WHERE "normalizedPhone"='0771000002'`)).rows[0].count, 1);

  const details = await callAction(manifest, "src/app/(app)/customers/management-actions.ts", "getCustomerDetails", [customer.id], adminLogin.jar);
  assert.equal(details.value.id, customer.id);
  const update = await callAction(manifest, "src/app/(app)/customers/management-actions.ts", "updateCustomer", [{ id: customer.id, fullName: "Updated Customer", nic: customer.nic, mobile: "0771000004", additionalMobile: "", address: "Updated Address", area: "", guarantorDetails: "", notes: "" }], adminLogin.jar);
  assert.equal(update.value.success, true);
  assert.equal((await db.query(`SELECT "normalizedPhone" FROM "CustomerPhone" WHERE "customerId"=$1`, [customer.id])).rows[0].normalizedPhone, "0771000004");

  const staffDeleteInvalid = await callAction(manifest, "src/app/(app)/customers/management-actions.ts", "deleteCustomers", [{ customerIds: [customer.id], adminPassword: "wrong" }], staffLogin.jar);
  assert.equal(staffDeleteInvalid.value.success, false);
  const staffDelete = await callAction(manifest, "src/app/(app)/customers/management-actions.ts", "deleteCustomers", [{ customerIds: [customer.id], adminPassword: password }], staffLogin.jar);
  assert.equal(staffDelete.value.success, true, JSON.stringify(staffDelete.value));

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const denied = await callAction(manifest, "src/app/(app)/customers/management-actions.ts", "deleteCustomers", [{ customerIds: ["missing"], adminPassword: "wrong" }], staffLogin.jar);
    assert.equal(denied.value.success, false);
  }
  const throttled = await callAction(manifest, "src/app/(app)/customers/management-actions.ts", "deleteCustomers", [{ customerIds: ["missing"], adminPassword: password }], staffLogin.jar);
  assert.equal(throttled.value.error, "Administrator authorization failed.");
  await db.query(`UPDATE "AuditLog" SET "createdAt"=CURRENT_TIMESTAMP-interval '16 minutes' WHERE "userId"=$1 AND action='CUSTOMER_ADMIN_APPROVAL_FAILED'`, [staffId]);
  const afterWindow = await callAction(manifest, "src/app/(app)/customers/management-actions.ts", "deleteCustomers", [{ customerIds: ["missing"], adminPassword: password }], staffLogin.jar);
  assert.equal(afterWindow.value.success, true);

  startStage("concurrent invalid and valid administrator approvals");
  const concurrentStaffId = unique("concurrent-staff");
  const concurrentStaffName = unique("concurrent-staff-user");
  await db.query(`INSERT INTO "User" (id,username,"passwordHash",role,"isActive","updatedAt") VALUES ($1,$2,$3,'STAFF',true,NOW())`, [concurrentStaffId, concurrentStaffName, passwordHash]);
  const concurrentLogin = await signIn(concurrentStaffName, password);
  const concurrentApprovals = await Promise.all(Array.from({ length: 8 }, () =>
    callAction(manifest, "src/app/(app)/customers/management-actions.ts", "deleteCustomers", [{ customerIds: ["missing"], adminPassword: "wrong" }], concurrentLogin.jar),
  ));
  const concurrentStatuses = concurrentApprovals.map(({ response }) => response.status);
  const concurrentAudit = await db.query(`SELECT action,count(*)::int AS count FROM "AuditLog" WHERE "userId"=$1 GROUP BY action ORDER BY action`, [concurrentStaffId]);
  const concurrentCustomerDeletes = await db.query(`SELECT count(*)::int AS count FROM "AuditLog" WHERE "userId"=$1 AND action='CUSTOMER_DELETED'`, [concurrentStaffId]);
  if (process.env.PHASE4B_FULL_DIAGNOSTIC === "1") {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const connectionStates = await db.query(`SELECT state,count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() GROUP BY state ORDER BY state`);
    console.log(JSON.stringify({
      requests: concurrentApprovals.map(({ response, value, digests }, index) => ({
        index,
        status: response.status,
        result: value && typeof value === "object" ? { success: value.success, error: value.error, deletedCount: value.deletedCount } : null,
        digests,
      })),
      audit: concurrentAudit.rows,
      customerDeleteAuditCount: concurrentCustomerDeletes.rows[0].count,
      connectionStates: connectionStates.rows,
      serverDiagnostics: safeServerDiagnostics,
    }));
    finishStages();
    return;
  }
  assert.ok(concurrentStatuses.every((status) => status === 200), JSON.stringify(concurrentStatuses));
  assert.ok(
    concurrentApprovals.every(
      ({ value, digests }) =>
        value?.success === false &&
        value?.error === "Administrator authorization failed." &&
        value?.deletedCount === 0 &&
        digests.length === 0,
    ),
    "Concurrent invalid approvals must all return controlled authorization failures.",
  );
  assert.equal(concurrentAudit.rows.reduce((sum, row) => sum + row.count, 0), 5);
  assert.equal(concurrentCustomerDeletes.rows[0].count, 0);

  const validConcurrentStaffId = unique("valid-concurrent-staff");
  const validConcurrentStaffName = unique("valid-concurrent-staff-user");
  await db.query(`INSERT INTO "User" (id,username,"passwordHash",role,"isActive","updatedAt") VALUES ($1,$2,$3,'STAFF',true,NOW())`, [validConcurrentStaffId, validConcurrentStaffName, passwordHash]);
  const validConcurrentLogin = await signIn(validConcurrentStaffName, password);
  const validConcurrentApprovals = await Promise.all(Array.from({ length: 8 }, () =>
    callAction(manifest, "src/app/(app)/customers/management-actions.ts", "deleteCustomers", [{ customerIds: ["missing"], adminPassword: password }], validConcurrentLogin.jar),
  ));
  assert.ok(validConcurrentApprovals.every(({ response, value }) => response.status === 200 && value?.success === true));
  const validConcurrentAudit = await db.query(`SELECT action,count(*)::int AS count FROM "AuditLog" WHERE "userId"=$1 GROUP BY action ORDER BY action`, [validConcurrentStaffId]);
  assert.deepEqual(validConcurrentAudit.rows, [{ action: "CUSTOMER_ADMIN_APPROVAL_SUCCEEDED", count: 8 }]);

  startStage("sale registration stock, rollback, snapshots, and authorization");
  const categoryId = unique("sale-category");
  const brandId = unique("sale-brand");
  const standardProductId = unique("sale-product");
  const rollbackProductId = unique("rollback-product");
  const limitedProductId = unique("limited-product");
  const brandedProductId = unique("branded-product");
  const productBrandId = unique("product-brand");
  await db.query(
    `INSERT INTO "ProductCategory" (id,name,"updatedAt") VALUES ($1,$2,NOW())`,
    [categoryId, unique("Sale Category")],
  );
  await db.query(
    `INSERT INTO "Brand" (id,name,"updatedAt") VALUES ($1,$2,NOW())`,
    [brandId, unique("Sale Brand")],
  );
  await db.query(
    `INSERT INTO "Product" (id,name,price,"stockQuantity","isActive","categoryId","updatedAt") VALUES
      ($1,'Standard Product',1000,5,true,$5,NOW()),
      ($2,'Rollback Product',500,2,true,$5,NOW()),
      ($3,'Limited Product',750,1,true,$5,NOW()),
      ($4,'Branded Product',900,0,true,$5,NOW())`,
    [standardProductId, rollbackProductId, limitedProductId, brandedProductId, categoryId],
  );
  await db.query(
    `INSERT INTO "ProductBrand" (id,"productId","brandId",price,"stockQuantity","isActive","updatedAt") VALUES ($1,$2,$3,900,1,true,NOW())`,
    [productBrandId, brandedProductId, brandId],
  );

  const staffSale = await verifiedSaleForm(manifest, staffLogin.jar, {
    items: [
      { productId: standardProductId, productBrandId: null, quantity: 2, unitPrice: "1250.25" },
      { productId: rollbackProductId, productBrandId: null, quantity: 1, unitPrice: "500.50" },
    ],
    advancePayment: "500.50",
    monthlyInstallmentAmount: "1000.25",
  });
  const staffSaleResult = await callAction(
    manifest,
    "src/app/(app)/sales/actions.ts",
    "createSaleRegistration",
    [{}, staffSale.form],
    staffLogin.jar,
  );
  assert.ok([200, 303].includes(staffSaleResult.response.status));
  const persistedSale = (
    await db.query(
      `SELECT s.id,s."totalAmount",s."advancePayment",s.status,s."customerId",cs."fullName" AS snapshot_name
       FROM "Sale" s JOIN "SaleCustomerSnapshot" cs ON cs."saleId"=s.id
       WHERE s."billNumber"=$1`,
      [staffSale.billNumber],
    )
  ).rows[0];
  assert.ok(persistedSale);
  assert.equal(String(persistedSale.totalAmount), "3001.00");
  assert.equal(String(persistedSale.advancePayment), "500.50");
  assert.equal(persistedSale.snapshot_name, staffSale.entered.fullName);
  const duplicateBillCheck = await callAction(
    manifest,
    "src/app/(app)/sales/actions.ts",
    "checkSaleCustomerRecords",
    [staffSale.entered],
    staffLogin.jar,
  );
  assert.equal(duplicateBillCheck.response.status, 200);
  assert.equal(duplicateBillCheck.value?.success, true);
  assert.equal(duplicateBillCheck.value?.billNumberTaken, true);
  assert.equal(
    (await db.query(`SELECT "stockQuantity" FROM "Product" WHERE id=$1`, [standardProductId])).rows[0].stockQuantity,
    3,
  );
  await db.query(`UPDATE "Customer" SET "fullName"='Changed after sale',"updatedAt"=NOW() WHERE id=$1`, [persistedSale.customerId]);
  assert.equal(
    (await db.query(`SELECT "fullName" FROM "SaleCustomerSnapshot" WHERE "saleId"=$1`, [persistedSale.id])).rows[0].fullName,
    staffSale.entered.fullName,
  );

  const anonymousSale = await verifiedSaleForm(manifest, staffLogin.jar, {
    items: [{ productId: standardProductId, productBrandId: null, quantity: 1, unitPrice: "1000" }],
  });
  const anonymousResult = await callAction(
    manifest,
    "src/app/(app)/sales/actions.ts",
    "createSaleRegistration",
    [{}, anonymousSale.form],
  );
  assert.ok([200, 302, 303, 307, 308].includes(anonymousResult.response.status));
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM "Sale" WHERE "billNumber"=$1`, [anonymousSale.billNumber])).rows[0].count, 0);

  const adminSale = await verifiedSaleForm(manifest, adminLogin.jar, {
    items: [{ productId: standardProductId, productBrandId: null, quantity: 1, unitPrice: "1000" }],
    advancePayment: "1000",
    monthlyInstallmentAmount: "0",
  });
  await callAction(manifest, "src/app/(app)/sales/actions.ts", "createSaleRegistration", [{}, adminSale.form], adminLogin.jar);
  assert.deepEqual(
    (await db.query(`SELECT status FROM "Sale" WHERE "billNumber"=$1`, [adminSale.billNumber])).rows[0],
    { status: "PAID" },
  );

  const insufficientProduct = await verifiedSaleForm(manifest, staffLogin.jar, {
    items: [{ productId: limitedProductId, productBrandId: null, quantity: 2, unitPrice: "750" }],
  });
  const insufficientProductResult = await callAction(manifest, "src/app/(app)/sales/actions.ts", "createSaleRegistration", [{}, insufficientProduct.form], staffLogin.jar);
  assert.deepEqual(insufficientProductResult.value, { error: "stock" });

  const insufficientBrand = await verifiedSaleForm(manifest, staffLogin.jar, {
    items: [{ productId: brandedProductId, productBrandId, quantity: 2, unitPrice: "900" }],
  });
  const insufficientBrandResult = await callAction(manifest, "src/app/(app)/sales/actions.ts", "createSaleRegistration", [{}, insufficientBrand.form], staffLogin.jar);
  assert.deepEqual(insufficientBrandResult.value, { error: "stock" });

  const rollbackSale = await verifiedSaleForm(manifest, staffLogin.jar, {
    items: [
      { productId: rollbackProductId, productBrandId: null, quantity: 1, unitPrice: "500" },
      { productId: limitedProductId, productBrandId: null, quantity: 2, unitPrice: "750" },
    ],
  });
  const rollbackResult = await callAction(manifest, "src/app/(app)/sales/actions.ts", "createSaleRegistration", [{}, rollbackSale.form], staffLogin.jar);
  assert.deepEqual(rollbackResult.value, { error: "stock" });
  assert.equal((await db.query(`SELECT "stockQuantity" FROM "Product" WHERE id=$1`, [rollbackProductId])).rows[0].stockQuantity, 1);
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM "Sale" WHERE "billNumber"=$1`, [rollbackSale.billNumber])).rows[0].count, 0);

  const concurrentA = await verifiedSaleForm(manifest, staffLogin.jar, {
    items: [{ productId: limitedProductId, productBrandId: null, quantity: 1, unitPrice: "750" }],
  });
  const concurrentB = await verifiedSaleForm(manifest, adminLogin.jar, {
    items: [{ productId: limitedProductId, productBrandId: null, quantity: 1, unitPrice: "750" }],
  });
  const concurrentSales = await Promise.all([
    callAction(manifest, "src/app/(app)/sales/actions.ts", "createSaleRegistration", [{}, concurrentA.form], staffLogin.jar),
    callAction(manifest, "src/app/(app)/sales/actions.ts", "createSaleRegistration", [{}, concurrentB.form], adminLogin.jar),
  ]);
  assert.equal(concurrentSales.filter(({ value }) => value?.error === "stock").length, 1);
  assert.equal(
    (await db.query(`SELECT count(*)::int AS count FROM "Sale" WHERE "billNumber"=ANY($1::text[])`, [[concurrentA.billNumber, concurrentB.billNumber]])).rows[0].count,
    1,
  );
  assert.equal((await db.query(`SELECT "stockQuantity" FROM "Product" WHERE id=$1`, [limitedProductId])).rows[0].stockQuantity, 0);

  startStage("import security, concurrency, and recovery");
  const preview = await callAction(manifest, "src/app/(app)/customers/import/actions.ts", "validateCustomerImport", [importInput("phase4b_session_00000001", [["Import Customer","200000000010","0771000010","Import Address"]])], staffLogin.jar);
  assert.equal(preview.value.success, true);
  assert.ok(preview.value.token);
  const token = preview.value.token;
  const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
  assert.equal((await callAction(manifest, "src/app/(app)/customers/import/actions.ts", "commitCustomerImport", [tampered], staffLogin.jar)).value.success, false);
  const expired = resignImportToken(token, (payload) => { payload.expiresAt = Date.now() - 1; });
  assert.equal((await callAction(manifest, "src/app/(app)/customers/import/actions.ts", "commitCustomerImport", [expired], staffLogin.jar)).value.success, false);
  assert.equal((await callAction(manifest, "src/app/(app)/customers/import/actions.ts", "commitCustomerImport", [token], adminLogin.jar)).value.success, false);
  const wrongJob = resignImportToken(token, (payload) => { payload.jobId = "missing-job"; });
  assert.equal((await callAction(manifest, "src/app/(app)/customers/import/actions.ts", "commitCustomerImport", [wrongJob], staffLogin.jar)).value.success, false);
  const confirmations = await Promise.all([
    callAction(manifest, "src/app/(app)/customers/import/actions.ts", "commitCustomerImport", [token], staffLogin.jar),
    callAction(manifest, "src/app/(app)/customers/import/actions.ts", "commitCustomerImport", [token], staffLogin.jar),
  ]);
  assert.equal((await db.query(`SELECT count(*)::int AS count FROM "Customer" WHERE nic='200000000010'`)).rows[0].count, 1);
  assert.ok(confirmations.every(({ value }) => value.imported === 1 || value.inProgress || value.status === "COMPLETED"));
  const repeated = await callAction(manifest, "src/app/(app)/customers/import/actions.ts", "commitCustomerImport", [token], staffLogin.jar);
  assert.equal(repeated.value.imported, 1);

  const partialPreview = await callAction(manifest, "src/app/(app)/customers/import/actions.ts", "validateCustomerImport", [importInput("phase4b_session_00000002", [["Duplicate","200000000010","0771000011","Duplicate Address"],["Valid","200000000011","0771000012","Valid Address"]])], staffLogin.jar);
  const partialResult = await callAction(manifest, "src/app/(app)/customers/import/actions.ts", "commitCustomerImport", [partialPreview.value.token], staffLogin.jar);
  assert.equal(partialResult.value.imported, 1);
  assert.equal(partialResult.value.duplicate, 1);
  assert.equal(partialResult.value.status, "PARTIAL");

  const recoveryPreview = await callAction(manifest, "src/app/(app)/customers/import/actions.ts", "validateCustomerImport", [importInput("phase4b_session_00000003", [["Recovery","200000000012","0771000013","Recovery Address"]])], staffLogin.jar);
  await db.query(`UPDATE "ImportJob" SET status='PROCESSING',"leaseToken"='expired-lease',"leaseExpiresAt"=CURRENT_TIMESTAMP-interval '10 minutes',"startedAt"=CURRENT_TIMESTAMP,"attemptCount"=1 WHERE "sessionKey"='phase4b_session_00000003'`);
  const recovered = await callAction(manifest, "src/app/(app)/customers/import/actions.ts", "commitCustomerImport", [recoveryPreview.value.token], staffLogin.jar);
  assert.equal(recovered.value.imported, 1);

  const stalePreview = await callAction(manifest, "src/app/(app)/customers/import/actions.ts", "validateCustomerImport", [importInput("phase4b_session_00000004", [["Interrupted","200000000013","0771000014","Interrupted Address"]])], staffLogin.jar);
  await db.query(`UPDATE "ImportJob" SET status='PROCESSING',"leaseToken"='stale-lease',"leaseExpiresAt"=CURRENT_TIMESTAMP-interval '31 minutes',"startedAt"=CURRENT_TIMESTAMP-interval '40 minutes',"attemptCount"=1 WHERE "sessionKey"='phase4b_session_00000004'`);
  const interrupted = await callAction(manifest, "src/app/(app)/customers/import/actions.ts", "commitCustomerImport", [stalePreview.value.token], staffLogin.jar);
  assert.equal(interrupted.value.status, "FAILED");

  const readyPreview = await callAction(manifest, "src/app/(app)/customers/import/actions.ts", "validateCustomerImport", [importInput("phase4b_session_00000005", [["Abandoned","200000000014","0771000015","Abandoned Address"]])], staffLogin.jar);
  await db.query(`UPDATE "ImportJob" SET "createdAt"=CURRENT_TIMESTAMP-interval '31 minutes',"updatedAt"=CURRENT_TIMESTAMP-interval '31 minutes' WHERE "sessionKey"='phase4b_session_00000005'`);
  const abandoned = await callAction(manifest, "src/app/(app)/customers/import/actions.ts", "commitCustomerImport", [readyPreview.value.token], staffLogin.jar);
  assert.equal(abandoned.value.status, "FAILED");

  startStage("exports, stale sessions, and role refresh");
  const exportAll = await request("/customers/exports", {}, staffLogin.jar);
  assert.equal(exportAll.status, 200);
  assert.match(exportAll.headers.get("content-type") ?? "", /text\/csv/);
  assert.match(exportAll.headers.get("content-disposition") ?? "", /attachment/);
  const exportSelected = await request("/customers/exports/selected", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [(await db.query(`SELECT id FROM "Customer" ORDER BY "createdAt" LIMIT 1`)).rows[0].id] }) }, staffLogin.jar);
  assert.equal(exportSelected.status, 200);
  assert.match(exportSelected.headers.get("content-type") ?? "", /text\/csv/);
  const template = await request("/customers/import/template", {}, staffLogin.jar);
  assert.equal(template.status, 200);
  assert.match(template.headers.get("content-type") ?? "", /spreadsheetml/);

  await db.query(`UPDATE "User" SET "isActive"=false,"updatedAt"=NOW() WHERE id=$1`, [staffId]);
  const stale = await request("/customers/exports/selected", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: ["missing"] }) }, staffLogin.jar);
  assert.equal(stale.status, 401);
  await db.query(`UPDATE "User" SET role='ADMIN',"isActive"=true,"updatedAt"=NOW() WHERE id=$1`, [staffId]);
  const roleRefresh = await callAction(manifest, "src/app/(app)/customers/management-actions.ts", "deleteCustomers", [{ customerIds: ["missing"] }], staffLogin.jar);
  assert.notEqual(roleRefresh.value.error, "Administrator authorization failed.");

  const audit = JSON.stringify((await db.query(`SELECT action,reason,"beforeData","afterData" FROM "AuditLog"`)).rows);
  assert.doesNotMatch(audit, new RegExp(password.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  console.log("PASS authenticated Customers application integration tests");
  finishStages();
}

try {
  await main();
} finally {
  clearStageTimer();
  await shutdownResources();
}
