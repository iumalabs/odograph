# Internal Contracts: Email Reminder Delivery

This feature adds no new HTTP route — every reminder-rule route from spec 011
(`specs/011-reminder-rules-cron/contracts/api.md`) is unchanged. The contracts below are internal
function signatures, documented because they're the interface this feature's implementation and
tests are written against.

## `evaluateAllReminders(db: D1Database): Promise<{ evaluated: number; failed: number; notified: number }>`

Extended from spec 011 (was `{ evaluated, failed }`). `notified` counts every row for which an
email was actually sent successfully in this run — it does **not** count rows skipped due to a
placeholder recipient address, and does not count rows whose status didn't cross a new severity
threshold. A row that fails during status evaluation (as in spec 011) or during the email step is
counted in `failed`, not `notified`, and does not stop the rest of the sweep (FR-010).

## `findDeliverableReminderRecipient(db: D1Database, tenantId: string): Promise<string | null>`

Resolves the email address to notify for a tenant, or `null` if none is deliverable
(research.md Decision 3):

1. If the tenant's `users.email` is not a placeholder address, return it.
2. Else, if any `magic_link_identities` row is linked to that user's id, return its `email`.
3. Else, return `null`.

Never throws — a lookup miss is a `null` return, not an error, since "no deliverable address" is
an expected, common state (User Story 4), not a failure.

## `isPlaceholderEmail(email: string): boolean`

Pure helper — `true` iff `email` ends with the passkey signup placeholder domain
(`@example.invalid`), matching exactly what `src/server/routes/v1/auth/passkey.ts` generates when
no email is supplied at registration.

## `sendReminderDueEmail(env: Env, input: { to: string; vehicleName: string; ruleLabel: string; status: "coming_up" | "overdue" }): Promise<{ sent: true } | { sent: false; error: string }>`

Sends one transactional email via the existing `env.EMAIL` (`send_email`) binding, mirroring
`sendMagicLinkEmail()`'s contract exactly: never throws, always resolves to a `sent`/`error`
result. Subject and body name `vehicleName` and `ruleLabel` and state the `status` in plain
language ("is coming up" / "is overdue"), satisfying FR-011. No return value beyond the sent/error
result is consumed by the caller — the caller (`evaluateAllReminders`) only needs to know whether
to advance `last_notified_severity`.
