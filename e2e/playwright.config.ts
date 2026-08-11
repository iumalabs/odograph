import { defineConfig, devices } from "@playwright/test";

// Overridable so a dev machine (or a sandboxed environment) that already has
// something else bound to the project's usual 5173 can point tests
// elsewhere without editing this file.
const PORT = Number(process.env.E2E_PORT) || 5173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  // The target under test is one local `vite dev` process backed by one
  // Miniflare-simulated D1/KV/R2 instance — not a real deployed Worker's
  // stateless, horizontally-scaled request handling. Concurrent test
  // sessions hitting that single simulated backend at once produced
  // dropped clicks/lost requests that don't reproduce serially; running
  // fully serial trades suite speed for determinism against this
  // particular target, which local dev tooling doesn't parallelize well.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Same single-dev-server caveat as above, plus a specific, now-identified
  // one: @cloudflare/vite-plugin's Miniflare 5.x-alpha (this root project's
  // current pin — see deno.lock) intermittently crashes its own internal
  // undici proxy ("fetch failed" in Miniflare's dispatchFetch) on a POST
  // whose handler returns a non-2xx status, more often the larger/slower
  // the request body is — matches several still/recently-open upstream
  // reports against older Miniflare 4.x
  // (github.com/cloudflare/workers-sdk/issues/13013, /13189, /13327) for the
  // same "fetch failed in dispatchFetch" signature, though those describe
  // it as fully deterministic where this alpha's manifestation is
  // intermittent and body-size-correlated instead — a variant, not
  // necessarily the identical regression. Only ever observed on CI (never
  // locally, dozens of runs), which tracks: CI's constrained resources give
  // that internal race more room to lose. Two retries there (one still
  // locally, where it's never been needed) absorbs it without masking a
  // genuine repro, which would still fail a third time too. Filed as
  // issue #89 for the dev agent — pinning Miniflare to a fixed version is
  // a root deno.json change outside this suite's scope.
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  // Boots the real Worker + client via the root project's own Deno task —
  // e2e tests run against the same `vite dev` stack a developer uses
  // locally, not a mocked server. ENVIRONMENT stays "development" (the
  // wrangler.toml default), which is what keeps /api/v1/_dev/session
  // reachable for auth bootstrap (see support/dev-session.ts).
  webServer: {
    // Goes through the root project's own `deno task dev` — never a bare
    // `deno run -A npm:vite` — so it resolves the exact Vite version pinned
    // in the root deno.json. A bare npm: specifier outside that task's
    // resolution context silently pulls whatever is latest on the npm
    // registry instead of the pin, which surfaced as broken click handling
    // during this suite's own development (a completely different, far
    // newer major Vite/Rolldown build) and cost real time to diagnose.
    command: `deno task dev --port ${PORT}`,
    cwd: "..",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
