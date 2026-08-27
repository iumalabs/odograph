# Data Model: Cloudflare OIDC Sign-In

No new tables, no migration. This feature reuses the two existing tables `specs/004`'s design
explicitly anticipated a second provider for:

## `oidc_identities` (migration `0004_oidc.sql`)

| Column | Type | Notes |
|---|---|---|
| `provider` | `TEXT NOT NULL` | `'google'` today; this feature adds `'cloudflare'` as a second value — not a hardcoded assumption anywhere in the schema |
| `subject` | `TEXT NOT NULL` | The provider's stable, opaque subject id (`sub` claim) — never email |
| `user_id` | `TEXT NOT NULL REFERENCES users(id)` | |

**Primary key**: `(provider, subject)` — composite, exactly as before. Confirmed directly from the
migration file: `specs/004-google-oidc-authentication/data-model.md`'s own words already say *"A
second provider added later reuses this same table with a different `provider` value... no
migration needed."* This feature is that second provider.

## `oidc_states` (migration `0004_oidc.sql`, `linking_user_id` added in `0005_account_linking.sql`)

| Column | Type | Notes |
|---|---|---|
| `state` | `TEXT PRIMARY KEY` | Opaque per-attempt CSRF/correlation secret |
| `code_verifier` | `TEXT NOT NULL` | PKCE verifier |
| `expires_at` | not null | |
| `linking_user_id` | `TEXT NULL REFERENCES users(id)` | Set only for the account-linking flow |

Already fully provider-agnostic — it has no `provider` column at all, since each authorization
attempt (Google or Cloudflare) generates its own random `state` value with no cross-provider
collision risk. Zero changes needed here.

## No new entities

The spec's own Key Entities section already noted this: this feature reuses the existing
multi-provider identity-linking model, extended to a second OIDC provider value.
