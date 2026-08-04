declare namespace Cloudflare {
  interface Env {
    // Test-only binding, populated in vitest.config.ts via readD1Migrations
    // and consumed by tests/setup/apply-migrations.ts.
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
