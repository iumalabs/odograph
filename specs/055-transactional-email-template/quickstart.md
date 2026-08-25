# Quickstart: Styled Transactional Email Template

Manual + automated validation for this feature. No new environment variables, bindings, or
migrations — same local setup as any other server-side change.

## Prerequisites

- `deno task dev` running locally (uses Miniflare's local email capture — sent mail is written to
  files under `/tmp/miniflare-*/email/`, not actually delivered, matching every other local dev
  email flow already in this project).
- A vehicle with at least one due/overdue reminder, for validating User Story 2.

## Automated validation

```sh
deno task test tests/server/email-template.test.ts   # new: chrome renderer unit tests
deno task test tests/server/magic-link-auth.test.ts   # existing: confirms the token/verify flow
                                                         # still works end-to-end after the content
                                                         # change (no assertion on email body shape
                                                         # today, so nothing to update there)
deno task check                                        # fmt, lint, typecheck, full suite, build
```

Unit tests for the new renderer should cover, per data-model.md's validation rules:

- All 3 magic-link purposes produce a non-empty `html` and `text` body containing the purpose's
  `ctaUrl` in both (FR-004).
- A content object with `ctaLabel`/`ctaUrl` set to `null` (the reminder case) renders with no
  button markup at all, not an empty/broken button.
- A `details` array omitting a row (e.g. no `INSTANCE` entry) never renders a fabricated value for
  it — the row is simply absent from the output.
- The rendered HTML contains no `<link rel="stylesheet">` and no CSS outside one `<style>` block
  (the FR-009 responsive breakpoint) — every element's own layout/color styling is inline, which
  is the actual thing FR-002 depends on.
- With the `<style>` block stripped entirely (simulating a client that ignores it), the remaining
  inline-styled markup still renders a correct, legible desktop-width layout — the FR-002
  fallback FR-009's own edit calls out.

## Manual validation

1. **New account** (User Story 1, scenario 1): sign up with a fresh email. Open the captured
   email file. Confirm: dark header with "NEW ACCOUNT" tag, headline/body referencing account
   creation, a lime CTA button, an expiry strip, an ACCOUNT/INSTANCE details block, a plain-text
   fallback link matching the button's `href`, and a dark footer.
2. **Sign-in** (scenario 2): request a sign-in link for that same account. Confirm the same chrome
   with sign-in-specific copy and a `"SIGN-IN LINK"` tag.
3. **Link email** (scenario 3): while signed in, link a second email address. Confirm the same
   chrome with linking-specific copy and a `"CONFIRM EMAIL"` tag.
4. **Plain-text fallback** (scenario 4): open the same captured email's `text` part directly (not
   the `html` part). Confirm the destination URL is present as visible text on its own.
5. **Reminder notification** (User Story 2): trigger `evaluateAllReminders`/
   `evaluateAllDocumentReminders` against a due/overdue item (or wait for the scheduled sweep in
   dev). Confirm the captured email uses the same header/footer chrome, a `"REMINDER"` tag, the
   existing reminder copy in the body slot, and **no** button section.
6. **Client-compatibility spot check**: paste the rendered `html` output into an email-client
   preview tool (or a plain browser tab with `<style>`/external CSS disabled) and confirm the
   layout doesn't collapse — inline styles are the thing actually being validated here, not a
   specific tool.

## Expected outcome

Every item above passes without needing to touch `FROM_ADDRESS`, environment gating, or anything
else in the delivery path fixed by issue #223 — this feature only changes what's inside the
`html`/`text` strings already being sent.
