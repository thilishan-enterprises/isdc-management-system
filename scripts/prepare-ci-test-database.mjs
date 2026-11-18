import process from "node:process";
import { Client } from "pg";
import {
  validateCiDatabaseConfiguration,
  validateCiServerIdentity,
} from "./ci-database-safety.mjs";

const operation = process.argv[2];
if (!new Set(["recreate", "drop"]).has(operation)) {
  throw new Error("Usage: node scripts/prepare-ci-test-database.mjs <recreate|drop>");
}

const { adminUrl, databaseName } = validateCiDatabaseConfiguration(process.env);

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const client = new Client({ connectionString: adminUrl.toString() });
await client.connect();
try {
  const identity = await client.query(`
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
  await client.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid <> pg_backend_pid()", [databaseName]);
  await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
  if (operation === "recreate") {
    await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)} TEMPLATE template0`);
  }
  console.log(`Disposable CI database ${operation === "recreate" ? "prepared" : "removed"}.`);
} finally {
  await client.end();
}
