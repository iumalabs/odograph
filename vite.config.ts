import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { unstable_readConfig } from "wrangler";

// @cloudflare/vite-plugin builds against wrangler.toml's TOP-LEVEL section only — it has no
// concept of Wrangler's own named [env.X] blocks (its output records their names under
// `definedEnvironments` but never selects one). Left alone, every build — local dev, every PR
// preview, and production alike — silently resolves to the same top-level (development)
// bindings, and `wrangler deploy --env production` deploys that pre-resolved config, making
// `--env` a no-op.
//
// Passing the resolved env config directly as the plugin's `config` override doesn't work either:
// the plugin still auto-loads wrangler.toml's top-level section as a base and merges the override
// onto it, and that merge CONCATENATES array-valued fields (d1_databases, r2_buckets, even
// unrelated string arrays like definedEnvironments) instead of replacing them — every array ends
// up with both the production/preview entry and the top-level one. Writing the fully-resolved,
// single-environment config to its own standalone file and pointing `configPath` at it sidesteps
// the merge entirely — the plugin just loads that file as-is, the same code path the top-level
// default already uses successfully with no merge happening at all.
//
// Deliberately keyed off a dedicated WRANGLER_ENV variable, not Vite's own --mode: Vite's default
// build mode is literally the string "production" (an unrelated axis — minification, dead-code
// elimination, import.meta.env.PROD), so a bare `deno task build` (no explicit mode) would
// otherwise silently resolve to Wrangler's production environment too, contradicting
// wrangler.toml's own stated intent that the top-level config is what local/default builds use.
function configPathFor(wranglerEnv: string): string {
  const dir = ".wrangler/vite-configs";
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `wrangler.${wranglerEnv}.json`);
  writeFileSync(path, JSON.stringify(unstable_readConfig({ env: wranglerEnv })));
  return path;
}

export default defineConfig(() => {
  const wranglerEnv = process.env.WRANGLER_ENV;

  return {
    plugins: [
      react(),
      cloudflare(wranglerEnv ? { configPath: configPathFor(wranglerEnv) } : {}),
    ],
  };
});
