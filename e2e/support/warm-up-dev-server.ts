import type { FullConfig } from "@playwright/test";

/**
 * Playwright `globalSetup`: fires one throwaway `POST /api/v1/_dev/session`
 * (the exact call every real test's `session`/`authedPage` fixture makes
 * first — see `dev-session.ts`) before any real test runs.
 *
 * Hypothesis under investigation (issue #89, reopened scope): the
 * `webServer.url` readiness probe Playwright already waits on before
 * starting tests only checks that the dev server answers *something* at
 * the root URL — it doesn't exercise the Worker/D1 code path this route
 * needs, which can still be cold (Miniflare's simulated D1 binding,
 * Vite's on-demand transform of server-side modules not yet requested).
 * Both CI failures examined for this issue broke on the very FIRST test
 * executed in the run, seconds after "Running N tests" — not a later one,
 * and not specifically after a retry, which rules out a build-up-over-time
 * explanation for those two runs (there's no prior worker recycling
 * possible before a run's first test). A cold first-request tax on this
 * shared bootstrap route fits that observation: absorb it here, in
 * `globalSetup` (uncounted, no test's fixed assertion window pays for it),
 * instead of inside whichever test happens to run first.
 *
 * Best-effort: a failure here isn't swallowed *silently* (logged), but
 * isn't fatal either — if the dev server is genuinely broken, the real
 * tests will surface that themselves with a proper error, same as always.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return;

  try {
    const res = await fetch(`${baseURL}/api/v1/_dev/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) {
      console.warn(`\nDev-server warm-up request returned ${res.status} — continuing anyway.\n`);
    }
  } catch (error) {
    console.warn(
      `\nDev-server warm-up request failed (${
        error instanceof Error ? error.message : String(error)
      }) — continuing anyway.\n`,
    );
  }
}
