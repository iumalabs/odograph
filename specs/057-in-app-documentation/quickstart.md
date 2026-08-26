# Quickstart: In-App Documentation Viewer

Manual validation for this feature. No new environment variables, bindings, or migrations. No new
client-component test suite exists in this project, so verification is `deno task check` plus the
manual walkthrough below, matching specs 055/056/241's established pattern for UI-only changes.

## Prerequisites

- `deno task dev` running locally.
- A signed-in test session (for User Story 1) and a fresh unauthenticated session (for User Story 2
  — see specs/056 quickstart.md for how to force a logged-out state via
  `POST /api/v1/_dev/session/invalidate` in dev).

## Automated validation

```sh
deno task check   # fmt, lint, typecheck, full suite, build
```

## Manual validation

1. **Signed-in entry point** (User Story 1, scenario 1): sign in, click "Help" in the nav rail.
   Confirm a section list renders on the left (at least the 6 sections from data-model.md) and the
   first section's content (heading, lead, blocks) renders on the right.
2. **Section switching** (scenario 2): click a different section in the sidebar. Confirm the right
   pane updates and the sidebar highlights the newly-selected section.
3. **Content accuracy spot check** (scenario 3–4): read "Signing in" — confirm it names passkey,
   magic link, and Google, and contains no mention of Cloudflare Access, a JWT header, or a
   `cloudflared` tunnel. Read "Self-hosting" — confirm it describes `wrangler`, not `docker run`.
4. **Pagination** (scenario 5): on the first section, confirm "previous" is absent/disabled; step
   through to the last section via "next" and confirm "next" becomes absent/disabled there.
5. **Signed-out access** (User Story 2, scenario 1): force a logged-out session, load the landing
   page, click "Documentation". Confirm the same Help content renders in place (inside the landing
   page's own header, per research.md Decision 3) — not a sign-in wall, and not a navigation to the
   external GitHub README anymore.
6. **Narrow viewport**: resize to a mobile width. Confirm the two-column layout (section list +
   content) stacks or scrolls sensibly — no clipped section list, no horizontally-overflowing page.

## Expected outcome

Every item above passes without touching any server-side code or the auth API routes — this
feature only adds client-side content and a new view.
