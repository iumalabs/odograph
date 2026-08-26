import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "migrations"));

  return {
    test: {
      include: ["tests/server/**/*.test.ts", "tests/client/**/*.test.ts"],
      setupFiles: ["./tests/setup/apply-migrations.ts"],
    },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          // Test-only binding so the setup file can apply migrations
          // (see tests/setup/apply-migrations.ts and tests/setup/env.d.ts).
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
  };
});
