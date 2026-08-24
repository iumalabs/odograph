import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
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
    // Exposes which Wrangler environment this build targets to client code as a build-time
    // constant — import.meta.env.PROD alone can't distinguish preview from production (both run
    // `vite build`, mode defaults to "production" either way, per this file's own comment above);
    // only WRANGLER_ENV actually carries that distinction. Used by src/client/monitoring.ts
    // (specs/054-error-monitoring) to keep error/trace capture off outside production.
    define: {
      __WRANGLER_ENV__: JSON.stringify(wranglerEnv ?? "development"),
      // Without this, @sentry/core's DEBUG_BUILD constant defaults to true in every build
      // (including production), which activates a dev-only strict DSN validator that rejects
      // FlightDeck's UUID-format project_ids and silently drops the client transport — Sentry
      // never sends anything, with no error anywhere (issue #205).
      __SENTRY_DEBUG__: JSON.stringify(false),
    },
    build: {
      // Fonts must stay same-origin url() references, never inlined as data: URIs — the CSP
      // (specs/015-csp-nonces) deliberately keeps font-src to 'self' only, matching how
      // @fontsource files are meant to be served (csp.ts's own comment: "fonts are self-hosted
      // via @fontsource, bundled as same-origin files"). Vite's default size-based inlining
      // (assetsInlineLimit, 4KB) doesn't know about that constraint and silently inlines small
      // font subsets as data: URIs, which the CSP then blocks on every single page load
      // (issue #191) — both .woff2 (the primary format) and its .woff fallback (smaller, and the
      // one actually falling under the 4KB default) need excluding; every other asset type's
      // default inlining behavior is untouched.
      assetsInlineLimit: (filePath: string) =>
        filePath.endsWith(".woff2") || filePath.endsWith(".woff") ? false : undefined,
    },
    plugins: [
      react(),
      cloudflare(wranglerEnv ? { configPath: configPathFor(wranglerEnv) } : {}),
      // Manifest is hand-written at public/manifest.webmanifest (manifest: false) and
      // registration is done manually from src/client/pwa.ts (injectRegister: null) — see
      // specs/018-pwa-installability/research.md. injectManifest (not generateSW) hands full
      // control of the service worker's fetch handling to src/client/sw.ts, whose own code
      // contains no navigation-caching logic at all: every page load must reach the Worker over
      // the network unconditionally so it gets a fresh CSP nonce (specs/015-csp-nonces) — a
      // config flag can't guarantee that as reliably as the absence of the code that would do it.
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src/client",
        filename: "sw.ts",
        injectRegister: null,
        manifest: false,
        injectManifest: {
          globPatterns: ["**/*.{js,css,woff2,png,svg}"],
        },
      }),
    ],
  };
});
