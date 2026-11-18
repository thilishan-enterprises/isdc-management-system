import process from "node:process";
import { Client } from "pg";

const operation = process.argv[2];
if (!new Set(["recreate", "drop"]).has(operation)) {
  throw new Error("Usage: node scripts/prepare-ci-test-database.mjs <recreate|drop>");
}

const testUrlText = process.env.TEST_DATABASE_URL;
const adminUrlText = process.env.TEST_DATABASE_ADMIN_URL;
if (!testUrlText || !adminUrlText) throw new Error("Explicit test and admin database URLs are required.");
if (testUrlText === process.env.DATABASE_URL || adminUrlText === process.env.DATABASE_URL) {
  throw new Error("CI database URLs must not equal DATABASE_URL.");
}

const testUrl = new URL(testUrlText);
const adminUrl = new URL(adminUrlText);
const databaseName = testUrl.pathname.slice(1);
const allowedName = /^customers_phase4[ab]_[a-z0-9_]*test$/i.test(databaseName);
const loopback = new Set(["localhost", "127.0.0.1", "::1"]);
if (!allowedName) throw new Error("Refusing unsafe CI database name.");
if (!loopback.has(testUrl.hostname) || !loopback.has(adminUrl.hostname)) throw new Error("CI database hosts must be loopback service mappings.");
if (testUrl.host !== adminUrl.host) throw new Error("Test and admin URLs must target the same disposable PostgreSQL service.");
if (adminUrl.pathname !== "/postgres") throw new Error("Admin URL must target the disposable postgres database.");

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const client = new Client({ connectionString: adminUrl.toString() });
await client.connect();
try {
  const identity = await client.query("SELECT current_database() AS database, inet_server_addr()::text AS address");
  if (identity.rows[0].database !== "postgres") throw new Error("Unexpected CI administrator database.");
  if (!["127.0.0.1", "::1", null].includes(identity.rows[0].address)) throw new Error("CI PostgreSQL is not the loopback service.");
  await client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", [databaseName]);
  await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
  if (operation === "recreate") {
    await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)} TEMPLATE template0`);
  }
  console.log(`Disposable CI database ${operation === "recreate" ? "prepared" : "removed"}.`);
} finally {
  await client.end();
}
