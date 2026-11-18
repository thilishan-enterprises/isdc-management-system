import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCiDatabaseConfiguration,
  validateCiServerIdentity,
} from "./ci-database-safety.mjs";

const password = "phase4b-ci-password-only";
const baseEnv = {
  CI: "true",
  PHASE4B_POSTGRESQL_CI: "true",
  DATABASE_URL:
    "postgresql://phase4b_ci:phase4b-ci-password-only@127.0.0.1:5432/customers_phase4b_build_test",
  TEST_DATABASE_ADMIN_URL: `postgresql://phase4b_ci:${password}@127.0.0.1:5432/postgres`,
  TEST_DATABASE_URL: `postgresql://phase4b_ci:${password}@127.0.0.1:5432/customers_phase4b_focused_test`,
};

const serverIdentity = {
  database: "postgres",
  username: "phase4b_ci",
  server_version_num: 160011,
  in_recovery: false,
  can_create_database: true,
  address: "172.18.0.2",
};

test("accepts the designated CI service even with a Docker server address", () => {
  const result = validateCiDatabaseConfiguration(baseEnv);
  assert.equal(result.databaseName, "customers_phase4b_focused_test");
  assert.doesNotThrow(() => validateCiServerIdentity(serverIdentity));
});

test("accepts explicit localhost and IPv6 loopback mappings", () => {
  for (const host of ["localhost", "[::1]"]) {
    assert.doesNotThrow(() =>
      validateCiDatabaseConfiguration({
        ...baseEnv,
        TEST_DATABASE_ADMIN_URL: `postgresql://phase4b_ci:${password}@${host}:5432/postgres`,
        TEST_DATABASE_URL: `postgresql://phase4b_ci:${password}@${host}:5432/customers_phase4a_test`,
      }),
    );
  }
});

for (const [name, override] of [
  ["remote database host", { TEST_DATABASE_URL: `postgresql://phase4b_ci:${password}@example.neon.tech:5432/customers_phase4b_focused_test` }],
  ["unexpected hostname", { TEST_DATABASE_URL: `postgresql://phase4b_ci:${password}@postgres:5432/customers_phase4b_focused_test` }],
  ["unexpected database", { TEST_DATABASE_URL: `postgresql://phase4b_ci:${password}@127.0.0.1:5432/customer_data` }],
  ["unexpected username", { TEST_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:5432/customers_phase4b_focused_test` }],
  ["unexpected password", { TEST_DATABASE_URL: "postgresql://phase4b_ci:wrong@127.0.0.1:5432/customers_phase4b_focused_test" }],
  ["unexpected port", { TEST_DATABASE_URL: `postgresql://phase4b_ci:${password}@127.0.0.1:6543/customers_phase4b_focused_test` }],
  ["missing CI marker", { PHASE4B_POSTGRESQL_CI: undefined }],
]) {
  test(`rejects ${name} before database operations`, () => {
    assert.throws(() =>
      validateCiDatabaseConfiguration({ ...baseEnv, ...override }),
    );
  });
}

for (const [name, override] of [
  ["administrator database", { database: "customer_data" }],
  ["database role", { username: "postgres" }],
  ["PostgreSQL major version", { server_version_num: 150012 }],
  ["recovery state", { in_recovery: true }],
  ["database creation privilege", { can_create_database: false }],
]) {
  test(`rejects unexpected server ${name} before destructive statements`, () => {
    assert.throws(() =>
      validateCiServerIdentity({ ...serverIdentity, ...override }),
    );
  });
}
