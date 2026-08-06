/**
 * CI coverage gate. Reads coverage/coverage-summary.json (written by
 * support/coverage.ts's `generate()`) and fails if overall function
 * coverage regresses below THRESHOLD.
 *
 * THRESHOLD is NOT 100% — not achievable through this suite alone right
 * now, for two structural reasons plus one that's just unfinished work:
 *
 * 1. Google OIDC (src/client/auth/oidc.ts's link target,
 *    completeGoogleSignIn's callback path): requires a real Google
 *    consent-screen interaction. Automating that in CI would mean either a
 *    stub OAuth provider or committing real test-account credentials —
 *    both are infrastructure decisions, not something to bolt on
 *    unilaterally from the e2e side.
 * 2. Magic-link verify/link: the token is only ever delivered by real
 *    email (src/server/auth/magic-link.ts's `sendMagicLinkEmail`); there's
 *    no dev-only bypass for it the way `/api/v1/_dev/session` exists for
 *    session bootstrap. Needs either a dev-only token-retrieval endpoint
 *    (a server change, not this suite's to add) or real inbox access.
 * 3. Just plain not-yet-covered: the app grows faster than this suite can
 *    chase it in a single pass. `src/client/components/DashboardView.tsx`
 *    and `src/client/vehicle-aggregates.ts` (dashboard + server-computed
 *    aggregates, M6) landed after this suite's first pass and have zero
 *    tests yet. Genuinely just needs more test-writing, unlike #1/#2.
 *
 * Already resolved and NOT blockers: issue #49 (service/fuel record
 * update & delete had no UI) shipped in PR #58 — tests/{service,fuel}-
 * records.spec.ts now cover edit/save/cancel/delete. Passkey ceremonies
 * (spec 002) are fully automated via a CDP virtual authenticator
 * (support/webauthn.ts, tests/passkey.spec.ts) covering real registration,
 * login, and add-credential flows.
 *
 * THRESHOLD sits a few points under the measured baseline (~47-50%, it
 * moves run to run and as the app grows — see #3 above) as safety margin
 * against normal noise, not because that's some target. Raise it as real
 * coverage improves; never lower it to make a failing run pass.
 */
const THRESHOLD = 42;

const summaryPath = `${process.cwd()}/coverage/coverage-summary.json`;
const summary = JSON.parse(await Deno.readTextFile(summaryPath)) as { overallPct: number };

console.log(`Client coverage: ${summary.overallPct}% (threshold: ${THRESHOLD}%)`);

if (summary.overallPct < THRESHOLD) {
  console.error(
    `Coverage regressed: ${summary.overallPct}% is below the ${THRESHOLD}% floor. ` +
      `See coverage/summary.txt for the per-file breakdown.`,
  );
  Deno.exit(1);
}
