# Phase 0 Research: Magic Link Authentication

## Sending email: structured `send_email` binding API, not `cloudflare:email` + `mimetext`

**Decision**: `env.EMAIL.send({ to, from, subject, html, text })` — the current structured API,
configured via a plain `[[send_email]] name = "EMAIL"` binding in `wrangler.toml`.

**Rationale**: Cloudflare's own docs distinguish this from the older `cloudflare:email` module +
`mimetext` package approach, which is documented as the legacy path for hand-constructing raw MIME
messages. The structured API needs no new dependency and matches this project's existing "no more
dependencies than the task needs" posture (contrast with passkeys, which genuinely needed
`@simplewebauthn/*` for cryptographic ceremony handling — email sending doesn't have an equivalent
complexity floor).

**Alternatives considered**: `cloudflare:email` + `mimetext` — rejected; adds a dependency and
hand-rolled MIME construction for no benefit over the structured API for a plain HTML+text email.

## Sender verification: residual risk, mitigated with an early smoke test

**Decision**: Treat "does `env.EMAIL.send()` actually work end-to-end for the `odograph.dev` zone"
as unverified until tested against a real deployment, same posture research.md took for
`@simplewebauthn/server`'s workerd compatibility in specs/002. Cloudflare's docs reference an
`E_SENDER_NOT_VERIFIED` error class without fully documenting the verification flow in the pages
checked. Email Routing is now enabled for `odograph.dev` (prerequisite, done ahead of this plan);
whether the `send_email` binding requires additional sender/domain verification beyond that is the
open question.

**Mitigation**: First implementation task is a minimal smoke test — send one real email from a
deployed Worker (preview environment) and confirm it either succeeds or surfaces a specific,
actionable error (e.g. `E_SENDER_NOT_VERIFIED`) rather than proceeding to build the full feature on
an unverified assumption. If verification turns out to be needed, that's a manual one-time
dashboard/API step outside this feature's code (same category as enabling Email Routing itself), not
something this feature's implementation can complete on its own.

**Alternatives considered**: Assume it works and only find out at review time — rejected, matches
exactly the mistake specs/001 made with D1 migrations never being applied to the real remote
database until a live PR surfaced it; an early, cheap smoke test is strictly better than a surprise
deep in implementation.

## Token storage: D1, not KV — same reasoning as sessions and WebAuthn challenges

**Decision**: `magic_link_tokens` in D1, single-use enforced by delete-on-consume, same pattern
`webauthn_challenges` (specs/002) already established.

**Rationale**: A magic link token must be usable exactly once (FR-004) and a fresh request must
invalidate any prior unused token for the same email (FR-005) — both are correctness properties KV's
eventual consistency would put at risk, for the identical reasons specs/001 and specs/002 already
worked through for sessions and WebAuthn challenges respectively. No new tradeoff to re-litigate
here.

## Identity lookup: a dedicated table, never the shared `users.email` column

**Decision**: `magic_link_identities (email TEXT PRIMARY KEY, user_id TEXT REFERENCES users)`. "Has
this email signed up via magic link before" is answered by querying this table — never by querying
`users.email`, which specs/001's data-model.md already documents as deliberately non-unique across
tenants ("email is not a cross-tenant identity key... D-004: no auto-linking by email").

**Rationale**: This is the same shape of decision `webauthn_credentials` already made for passkeys —
a per-method identity record, not a global index. Querying `users.email` directly would let a
magic-link request silently authenticate into an account created by a _different_ method that
happens to share the email address, which is exactly the auto-linking D-004 prohibits. Caught during
spec drafting (see spec.md's Assumptions and FR-003a) and carried through to this table design.

**Alternatives considered**: A `method` column on `users` plus a unique `(email, method)` constraint
— rejected; splits the "which methods has this email used" question across two different query
shapes (`users` for some checks, credential/identity tables for others) instead of one consistent
pattern (a per-method identity table) that passkeys already established and future methods (Google
OIDC, issue #7) will also follow.

## Preventing a response-timing side channel (FR-006)

**Decision**: The request handler always performs the same sequence of work regardless of whether
the email is known — look up the identity (existing or not), always write a token row, always call
`env.EMAIL.send()` (with different subject/body content depending on new-vs-existing, but always
sending something) — and always returns the same `200` response shape. No early return on "email not
found."

**Rationale**: A response that returns immediately for "unknown email" and only does DB/email work
for "known email" (or vice versa) is a timing oracle. Doing equivalent work on both branches removes
the most obvious version of that gap. This isn't a formal constant-time guarantee (network jitter
dwarfs any remaining microsecond-level difference), which is why spec.md's SC-004 says "within
normal variance," not "provably constant-time" — that stronger claim isn't being made and doesn't
need to be.

**Alternatives considered**: A generic delay/jitter added to every response — rejected as
unnecessary complexity; doing the same real work on both branches already removes the structural
difference, and artificial delays would just slow down the legitimate case without adding meaningful
protection beyond that.

## Local/test verification of the send_email binding

**Decision**: Tests assert against the D1 token row and the `magic_link_identities` row created by a
request/verify cycle, not against an actually-received email (no real inbox in CI). Whether
`@cloudflare/vitest-pool-workers` simulates `send_email` locally without real delivery is
unconfirmed as of this writing — treated as part of the same smoke-test task above: if the local
test run's call to `env.EMAIL.send()` throws in the test environment, the request handler's own
FR-008 error handling (surface a failure) is what's being exercised anyway, which is itself useful
test coverage rather than a blocker.
