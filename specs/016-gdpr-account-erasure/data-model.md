# Phase 1 Data Model: GDPR Account Erasure

No new table, column, or migration. This feature deletes existing rows; it composes no new persisted
shape of its own beyond the request/response of the one route it adds.

## Every table, and its Principle VIII decision

Decision for every row in every table below, once the owning account is deleted: **full deletion,
immediate, no anonymisation, no retention window** (spec.md Assumptions) — this table exists to
document that decision per table, satisfying Principle VIII's "documented decision" requirement
retroactively for every table that shipped before this feature.

| Table                        | Erasure path                                                                                                                | Notes                                                                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tenants`                    | Direct `DELETE` (this feature's own statement)                                                                              | The root of the cascade.                                                                                                                                                                                                 |
| `users`                      | Cascades via `tenant_id`                                                                                                    |                                                                                                                                                                                                                          |
| `sessions`                   | Cascades via `user_id` → `users` → `tenant_id`                                                                              | Also handled explicitly at the HTTP layer: the _browser's_ cookie is cleared regardless of the row already being gone (FR-007).                                                                                          |
| `webauthn_credentials`       | Cascades via `user_id`                                                                                                      |                                                                                                                                                                                                                          |
| `magic_link_identities`      | Cascades via `user_id`                                                                                                      |                                                                                                                                                                                                                          |
| `oidc_identities`            | Cascades via `user_id`                                                                                                      |                                                                                                                                                                                                                          |
| `vehicles`                   | Cascades via `tenant_id`                                                                                                    |                                                                                                                                                                                                                          |
| `service_records`            | Cascades via `tenant_id` (and transitively `vehicle_id`)                                                                    |                                                                                                                                                                                                                          |
| `service_record_attachments` | Cascades via `tenant_id` for the D1 row; the R2 object itself is deleted explicitly _before_ the cascade runs (research.md) |                                                                                                                                                                                                                          |
| `fuel_records`               | Cascades via `tenant_id` (and transitively `vehicle_id`)                                                                    |                                                                                                                                                                                                                          |
| `fuel_record_attachments`    | Cascades via `tenant_id`; R2 object deleted explicitly first, same as service records                                       |                                                                                                                                                                                                                          |
| `reminder_rules`             | Cascades via `tenant_id`                                                                                                    |                                                                                                                                                                                                                          |
| `magic_link_tokens`          | **Explicit delete, before the cascade** — no foreign key to `tenants`/`users` for an ordinary sign-in token (research.md)   | Deleted by matching `email` against the tenant's own user(s), not by any foreign key.                                                                                                                                    |
| `webauthn_challenges`        | Out of scope                                                                                                                | No foreign key to any account; ephemeral pre-registration/authentication data with no personal-data content (spec.md Assumptions).                                                                                       |
| `oidc_states`                | Out of scope, except the `linking_user_id` column                                                                           | The bulk of this table (PKCE `state`/`code_verifier`) has no account relationship at all. The one column that does (`linking_user_id`, added for account-linking confirmation) already cascades via its own foreign key. |

## Repository layer additions (`src/server/db/repository.ts`)

- `listAttachmentKeysForTenant(db, ctx): Promise<string[]>` — all
  `service_record_attachments.r2_key` for the tenant, matched directly on that table's own
  `tenant_id` column (no join needed, unlike the existing vehicle-scoped equivalent).
- `listAttachmentKeysForTenantFuelRecords(db, ctx): Promise<string[]>` — same, for
  `fuel_record_attachments`.
- `deleteOutstandingMagicLinkTokensForTenant(db, ctx): Promise<void>` — deletes every
  `magic_link_tokens` row whose `email` matches any user under `ctx.tenantId`.
- `deleteTenantAccount(db, tenantId): Promise<boolean>` — `DELETE FROM tenants WHERE id = ?`;
  returns whether a row actually existed to delete (defensive — a route handler with a valid
  resolved session should never see `false` in practice).

## GDPR erasure

This feature _is_ the GDPR erasure mechanism (constitution Principle VIII) — see the table above.
