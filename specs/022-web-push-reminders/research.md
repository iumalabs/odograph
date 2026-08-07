# Phase 0 Research: Web Push Reminder Delivery

## Decision: `web-push-browser` for VAPID signing + `aes128gcm` payload encryption

**Decision**: Use the `web-push-browser` npm package (zero dependencies, Web Crypto API only,
explicitly built for browsers/Cloudflare Workers/Deno/Bun/Node without Node crypto shims) rather
than hand-rolling RFC 8291 payload encryption and RFC 8292 VAPID JWT signing, or using the mainline
`web-push` npm package.

**Rationale**: The mainline `web-push` package depends on Node's `crypto`/`https` modules in ways
that don't map cleanly onto the Workers runtime without the `nodejs_compat` compatibility flag —
this project doesn't use that flag today and its existing JWT work (`jose`, specs/003/004) already
establishes the precedent of Web-Crypto-native libraries over Node-shimmed ones. Correctly
implementing ECDH key agreement, HKDF key derivation, and AES-128-GCM encryption byte-for-byte per
RFC 8291 (exact salt lengths, `info` strings, padding) is meaningfully higher-stakes to get subtly
wrong than the project's existing hand-rolled precedents (e.g. magic-byte file-type sniffing,
specs/019) — those are small, self-contained parsers over well-defined binary formats with an easy
"does it recognize this file or not" correctness check; a wrong byte in an HKDF `info` string
produces a payload every push service silently fails to decrypt, which is a much harder failure mode
to catch without live infrastructure to test against. A small, focused, zero-dependency,
actively-maintained library (v1.4.2, no transitive dependencies) is the safer choice here, the same
way this project already reaches for `jose` rather than hand-rolling JWT signing.

**Alternatives considered**:
- **Mainline `web-push` (npm)**: rejected — requires `nodejs_compat` and Node's `crypto` module,
  neither used elsewhere in this codebase; would be the first exception to the project's existing
  Web-Crypto-only server-side crypto pattern.
- **Hand-roll RFC 8291/8292 directly against `crypto.subtle`**: rejected for this specific piece —
  unlike this project's other hand-rolled code (small, provably-correct, testable against a fixed
  input format), correctness here can only really be proven against live push services this dev
  environment can't reach, making a well-scoped, single-purpose, zero-dependency library the better
  risk/effort trade-off.
- **`pushforge`/`@mmmike/web-push`** (other zero-dependency Workers-targeted alternatives found):
  considered viable too; `web-push-browser` was chosen for its more mature version history (1.4.2 vs.
  0.1.0) as a light maintenance signal — either would satisfy the same constraints.

## Decision: Push shares the exact same trigger and `last_notified_severity` gate as email

**Decision**: No new Cron Trigger, no new escalation logic. Inside `evaluateAllReminders`
(`src/server/db/repository.ts`), at the same point email is already sent (the
`REMINDER_URGENCY[status] > notifiedSeverity` branch), the sweep also fetches the tenant's
`push_subscriptions` and attempts a push send to each. `last_notified_severity` advances if **at
least one channel** (email or any push subscription) succeeds — not per-channel — since the
underlying business event ("this reminder crossed into a new severity") is single and shared; a user
with both channels enabled expects both to fire together for the same crossing, not to be gated
independently.

**Rationale**: Directly required by spec.md's Assumptions (mirrors email's exact trigger/dedup rule)
and FR-004. Sharing one gate avoids the awkward alternative of two independent
"have I notified for this severity" flags that could drift out of sync (e.g. email already fired for
"overdue" but push, added later, would refire for the same already-notified crossing) — a single
shared gate is both simpler and matches user expectation.

**Alternatives considered**:
- **Per-channel dedup** (a second column, `last_notified_severity_push`): rejected — no requirement
  asks for independently-controllable dedup per channel, and it reopens exactly the "two flags can
  drift" problem a single shared gate avoids for free.

## Decision: `push_subscriptions` keyed by `tenant_id`, subscribe/unsubscribe session-only

**Decision**: `push_subscriptions(id, tenant_id, endpoint, p256dh, auth, created_at)`, unique on
`(tenant_id, endpoint)` (upsert on re-subscribe). The two new routes
(`POST`/`DELETE /api/v1/push/subscriptions`, `GET /api/v1/push/vapid-public-key`) sit behind
`tenantContext` (session cookie only), not `tenantContextOrToken`.

**Rationale**: `evaluateAllReminders` already operates per-`tenantId` with no `TenantContext` at all
(it's a Cron Trigger, not a request) — keying subscriptions by `tenant_id` directly matches the
shape the sweep already reads reminder rules in, avoiding an extra join through `users` at
send time. Session-only mirrors specs/017's own precedent: an API token has no service worker to
receive a push on, so there's no meaningful token-authenticated caller for these routes, the same
reasoning specs/017 applied to token management and account deletion.

**Alternatives considered**:
- **Keyed by `user_id`** (matching `api_tokens`' shape): considered — works equally well given this
  project's one-owner-per-tenant model (research confirmed `findDeliverableReminderRecipient`
  already treats a tenant as having one canonical recipient), but `tenant_id` avoids the extra join
  the sweep would otherwise need since it already has `tenantId` in hand and no `userId`.

## Decision: The VAPID public key is served via an authenticated endpoint, not baked into the client build

**Decision**: `GET /api/v1/push/vapid-public-key` (session-only, unauthenticated calls get the
existing 401) returns `{ publicKey: string }`. The client fetches it once when the user opts in,
rather than the key being injected into the client bundle at build time.

**Rationale**: This codebase has no existing precedent for baking server config into the client
bundle at build time (environment-specific values like `GOOGLE_SIGN_IN_URL` are server-served
redirect targets, not embedded secrets/config) — introducing a new build-time-injection mechanism
for this one value would be more machinery than fetching it once from an endpoint the app already
needs to be signed in to reach anyway.

**Alternatives considered**:
- **Vite build-time env injection**: rejected — new mechanism, no existing precedent, and the
  public key isn't performance-sensitive enough to justify avoiding one extra authenticated fetch.

## Decision: An expired/invalid subscription is deleted on delivery failure, not retried

**Decision**: `sendReminderPushNotification` reports back whether the push service responded with a
permanent failure (`404`/`410`, meaning the subscription no longer exists from the push service's
point of view) as a distinct `expired: true` result. The caller (`evaluateAllReminders`) deletes that
subscription row immediately; any other failure (network error, `5xx`) is logged/skipped without
deleting the row, since it may well succeed on the next sweep.

**Rationale**: Directly required by FR-008/the edge case in spec.md — a dead subscription must not
be retried forever, but a transient failure must not permanently give up on a device either. `404`/
`410` are the push-service-standard signal that a subscription is gone for good (browser uninstalled,
site data cleared, etc.) — the same distinction `web-push` implementations universally make.

**Alternatives considered**:
- **Never delete, just skip on any failure forever**: rejected — `push_subscriptions` would
  accumulate permanently-dead rows indefinitely, silently degrading `SC-002` ("100% of opted-in
  devices") without the user ever finding out, since there's no user-facing signal a subscription
  died until they check for themselves.
