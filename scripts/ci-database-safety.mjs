const EXPECTED_USERNAME = "phase4b_ci";
const EXPECTED_PASSWORD = "phase4b-ci-password-only";
const EXPECTED_PORT = "5432";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const ALLOWED_DATABASES = new Set([
  "customers_phase4b_focused_test",
  "customers_phase4b_complete_test",
  "customers_phase4a_test",
]);

function parsePostgresUrl(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  const url = new URL(value);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(`${label} must use PostgreSQL.`);
  }
  if (url.search || url.hash) {
    throw new Error(`${label} must not contain query parameters or fragments.`);
  }
  return url;
}

export function validateCiDatabaseConfiguration(env) {
  if (env.CI !== "true" || env.PHASE4B_POSTGRESQL_CI !== "true") {
    throw new Error("Explicit Phase 4B CI database marker is required.");
  }

  const testUrlText = env.TEST_DATABASE_URL;
  const adminUrlText = env.TEST_DATABASE_ADMIN_URL;
  const testUrl = parsePostgresUrl(testUrlText, "TEST_DATABASE_URL");
  const adminUrl = parsePostgresUrl(
    adminUrlText,
    "TEST_DATABASE_ADMIN_URL",
  );
  if (
    testUrlText === env.DATABASE_URL ||
    adminUrlText === env.DATABASE_URL
  ) {
    throw new Error("CI database URLs must not equal DATABASE_URL.");
  }

  for (const url of [testUrl, adminUrl]) {
    if (!LOOPBACK_HOSTS.has(url.hostname)) {
      throw new Error("CI database hosts must be explicit loopback mappings.");
    }
    if (url.port !== EXPECTED_PORT) {
      throw new Error("CI database port must be the expected PostgreSQL port.");
    }
    if (
      decodeURIComponent(url.username) !== EXPECTED_USERNAME ||
      decodeURIComponent(url.password) !== EXPECTED_PASSWORD
    ) {
      throw new Error("CI database credentials do not match the test service.");
    }
  }

  if (testUrl.host !== adminUrl.host) {
    throw new Error(
      "Test and admin URLs must target the same disposable PostgreSQL service.",
    );
  }
  const databaseName = decodeURIComponent(testUrl.pathname.slice(1));
  if (!ALLOWED_DATABASES.has(databaseName)) {
    throw new Error("Refusing unsafe CI database name.");
  }
  if (adminUrl.pathname !== "/postgres") {
    throw new Error(
      "Admin URL must target the disposable postgres database.",
    );
  }

  return { adminUrl, databaseName };
}

export function validateCiServerIdentity(identity) {
  if (
    identity?.database !== "postgres" ||
    identity?.username !== EXPECTED_USERNAME ||
    !Number.isInteger(identity?.server_version_num) ||
    identity.server_version_num < 160000 ||
    identity.server_version_num >= 170000 ||
    identity?.in_recovery !== false ||
    identity?.can_create_database !== true
  ) {
    throw new Error("Unexpected disposable PostgreSQL server identity.");
  }
}
