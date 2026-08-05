# Phase 0 Research: Email Reminder Delivery

## Decision 1: Severity comparison reuses the existing `REMINDER_URGENCY` ordering

**Decision**: Reuse the `on_track: 0, coming_up: 1, overdue: 2` ordering already defined as
`REMINDER_URGENCY` inside `src/server/db/repository.ts` (introduced by spec 011 to resolve which
side — date or mileage — is "more urgent" when a rule has both intervals). A reminder is notified
when `REMINDER_URGENCY[newStatus] > REMINDER_URGENCY[lastNotifiedStatus ?? "on_track"]`.

**Rationale**: This ordering already encodes exactly the semantics spec.md's Assumptions describe
("on track < coming up < overdue"); duplicating it as a second constant would drift the moment one
of the two is edited. `not_enough_data` is deliberately excluded from this map (as it already is
today) — a rule in that state is never compared for notification purposes (FR-004).

**Alternatives considered**: A separate numeric "urgency" column recomputed independently — rejected
as needless duplication of logic that already exists and is already unit-tested.

## Decision 2: New column stores the last-notified status string, not just a boolean/counter

**Decision**: Add `last_notified_severity TEXT` (nullable) to `reminder_rules`, storing one of
`"coming_up"`, `"overdue"`, or `NULL` (never notified, or reset to on-track). Same column type and
nullability style as spec 011's `cached_status`.

**Rationale**: Storing the actual status string (not just an urgency integer) keeps the column
self-describing for anyone inspecting the row directly, matches `cached_status`'s existing
precedent, and the severity comparison in Decision 1 works identically either way — no performance
or correctness reason to prefer a bare integer.

**Alternatives considered**: A `last_notified_at` timestamp instead of a status — rejected because a
timestamp alone can't answer "was this already notified at this severity," which is the actual
question FR-003 requires answering; a boolean "already notified" flag — rejected because it can't
distinguish "notified at coming_up" from "notified at overdue," which FR-001/FR-002 require to be
distinct events.

## Decision 3: Recipient resolution must NOT assume `users.email` is ever updated

**Decision**: A dedicated repository function resolves the deliverable recipient for a tenant as:
(1) if `users.email` for that tenant is not a placeholder (`@example.invalid`), use it; (2) else,
look up `magic_link_identities.email` for that `user_id` (any linked magic-link identity) and use
it if found; (3) else, there is no deliverable address — skip.

**Rationale**: Investigation of the existing auth code found that account linking
(`linkMagicLinkIdentity`, `linkOidcIdentity` in `repository.ts`) inserts into the identity tables
only — **`users.email` is set once at bootstrap and is never updated afterward**, for any auth
method. A user who registers via passkey with no email supplied gets a permanent
`${uuid}@example.invalid` placeholder in `users.email`; if they later link a real magic-link email
to that same account (D-004's flow), `users.email` stays the placeholder forever — the real,
deliverable address only exists in `magic_link_identities.email`. Relying on `users.email` alone
would silently and permanently break FR-009/User Story 4's "later adds a real email → gets
notified" requirement for exactly the accounts most likely to have started email-less. OIDC
identities (`oidc_identities`) store no email of their own — Google's claimed email is only ever
written into `users.email` at OIDC bootstrap time, so it's covered by step (1) already, not a third
lookup.

**Alternatives considered**: Trusting `users.email` alone — rejected per the above, it silently
regresses a functional requirement for a real (not hypothetical) subset of users. Adding a fourth
lookup against `oidc_identities` for an email — rejected, that table has no email column to look up.

## Decision 4: Email side effect lives inside `evaluateAllReminders`'s existing per-row loop

**Decision**: Extend the existing per-row `try`/`catch` in `evaluateAllReminders`
(`src/server/db/repository.ts`) to, after computing `status` and before moving to the next row: (a)
if `status` is `"on_track"`, clear `last_notified_severity` to `NULL` if it isn't already; (b) if
`status` is `"coming_up"` or `"overdue"` and more severe than the stored `last_notified_severity`
(Decision 1), resolve the recipient (Decision 3) and attempt to send; on a successful send (or a
placeholder-skip that isn't a send at all), update `last_notified_severity` accordingly per Decision
5; (c) if `status` is `"not_enough_data"`, do nothing to `last_notified_severity`. This all happens
inside the same `try` spec 011 already isolates per row, so an email failure is caught by the exact
same mechanism that already isolates a status-computation failure (FR-010) — no second try/catch
layer needed.

**Rationale**: A second Cron job or a second pass over `reminder_rules` would double the D1 reads
for no benefit — every piece of data the email step needs (`status`, the rule's `vehicleId`, the
row's own `tenantId`) is already in hand at the exact point `evaluateAllReminders` currently writes
`cached_status`. Extending the same loop is the smallest change that satisfies FR-006.

**Alternatives considered**: A separate `sendReminderNotifications(db)` function called after
`evaluateAllReminders` completes — rejected: it would need to re-fetch every row's freshly-computed
status (either by re-querying or by changing `evaluateAllReminders`'s return shape to carry
per-row results), adding complexity without adding correctness; the single-pass version is simpler
and equally testable via `createScheduledController()` per spec 011's existing pattern.

## Decision 5: Placeholder-address skip does not update `last_notified_severity`

**Decision**: When Decision 3's resolution finds no deliverable address, the row's
`last_notified_severity` is left exactly as it was (not advanced to the new status) — confirming
spec.md FR-009 and User Story 4's explicit requirement.

**Rationale**: Explicitly stated in the feature description and spec.md; recorded here only to make
the implementation-level consequence unambiguous: the "was this severity already notified" check
must be evaluated again on the very next sweep for a placeholder-address row, every day, until a
real address appears — which is correct and intended (it's cheap, and it's the only way a
later-added real email still triggers a notification for a reminder that's already been due for a
while).

## Decision 6: Reuse `env.EMAIL.send({...})` exactly as `sendMagicLinkEmail()` does, via a small new helper

**Decision**: Add `sendReminderDueEmail(env, input)` in a new `src/server/email/` module, mirroring
`sendMagicLinkEmail()`'s exact shape: same `FROM_ADDRESS = "auth@odograph.dev"` constant (duplicated
locally rather than exported/shared, since it's a one-line literal and the two modules have no other
reason to depend on each other), plain string-interpolated `text`/`html` bodies (no templating
library), wrapped in `try`/`catch` returning a `{ sent: true } | { sent: false; error }` result that
never throws — identical error-handling contract to the existing helper, so
`evaluateAllReminders`'s per-row `try`/`catch` continues to be the only failure-isolation mechanism
needed (Decision 4).

**Rationale**: Matches constitution Principle X (no new dependency) and the feature description's
explicit instruction to reuse the existing pattern; a generic multi-purpose "notification" framework
would be speculative generality for a single email type this project sends today.

**Alternatives considered**: A shared generic `sendEmail(env, {...})` wrapper extracted from both
`sendMagicLinkEmail` and this new function — considered, but the two emails' subject/body
construction genuinely differ enough (magic-link's purpose-keyed subjects/actions vs. this
feature's vehicle/reminder-labeled copy) that a shared wrapper would only save the single
`env.EMAIL.send({...})` call itself, not the surrounding logic — not worth the indirection for one
call site each. Revisit if a third email type appears.

## Decision 7: Testing asserts on D1 state and a new return count, not on captured email content

**Decision**: Extend `tests/server/reminder-rules.test.ts`'s existing scheduled-sweep `describe`
block rather than adding a new test file. Verified by direct inspection of
`tests/server/magic-link-auth.test.ts` (an earlier draft of this document incorrectly assumed it
asserts on captured email content — it does not): that suite never inspects the actual email body
or recipient; it only checks the HTTP handler's `{ sent: true }` response and separately validates
business-logic state by querying D1 directly (e.g. `findMagicLinkTokenByEmail`). There is no
existing mechanism in this project for a test to read back the content of an email sent through the
`env.EMAIL` binding. This feature's tests follow the same *actual* precedent: extend
`evaluateAllReminders`'s return shape from `{ evaluated, failed }` to also include `notified: number`
(a count, mirroring the existing two fields), and assert the resulting `last_notified_severity`
value per row via a direct `env.DB` query — the identical technique
`tests/server/reminder-rules.test.ts` already uses today for `cached_status`/`last_evaluated_at`.

**Rationale**: Matches what the codebase actually does today (verified, not assumed) rather than a
plausible-sounding mechanism that turned out not to exist. Asserting on `last_notified_severity` and
the `notified` count is sufficient to prove every functional requirement in spec.md (an email was
or wasn't triggered, and exactly once per escalation) without needing to inspect real email content,
which this project has never done in any existing test.

**Alternatives considered**: Reading Miniflare's local `send_email` simulator output files (visible
as `Text: /tmp/miniflare-.../email/...` lines in this project's existing test console output) from
within a test — rejected: those files are written to the host filesystem by the *outer* Miniflare
process, not reachable from inside the `workerd` sandbox a vitest-pool-workers test actually runs
in, and no existing test in this project does this, so there's no working precedent to follow.
