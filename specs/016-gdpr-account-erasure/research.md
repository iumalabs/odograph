# Phase 0 Research: GDPR Account Erasure

No `NEEDS CLARIFICATION` markers remain in the Technical Context. The decisions below document the
schema investigation this feature's whole design rests on, plus the two genuinely new mechanisms
(the confirmation gate, session termination after self-deletion).

## Every migration was read to confirm the cascade chain, not assumed

**Decision**: Erasure is one statement — `DELETE FROM tenants WHERE id = ?` — relying entirely on
foreign-key cascades already declared in every migration, rather than a sequence of per-table
`DELETE` statements written by this feature.

**Rationale**: Every migration (`0001` through `0011`) was read directly rather than trusted from
memory. Every table this project has falls into one of three groups:

1. **Cascades via `tenant_id ... REFERENCES tenants (id) ON DELETE CASCADE`**: `users`, `vehicles`,
   `service_records`, `service_record_attachments`, `fuel_records`, `fuel_record_attachments`,
   `reminder_rules` — each has its own direct foreign key to `tenants`, confirmed in migrations
   `0001`/`0006`/`0007`/`0008`/`0010`.
2. **Cascades via `user_id ... REFERENCES users (id) ON DELETE CASCADE`** (one hop further, but
   `users` itself cascades from `tenants` per group 1): `sessions` (`0001`), `webauthn_credentials`
   (`0002`), `magic_link_identities` (`0003`), `oidc_identities` (`0004`).
3. **No foreign key to `tenants`/`users` at all** — three ephemeral, pre-authentication tables:
   `webauthn_challenges` (`0002`), `magic_link_tokens` (`0003`, plus a nullable `linking_user_id`
   added in `0005` for the account-linking confirmation flow only), `oidc_states` (`0004`, same
   `linking_user_id` addition). Group 3 is where a plain tenant-cascade delete stops short.

The existing single-vehicle deletion route (`vehicles.delete("/:id", ...)`) already proves cascade
enforcement is genuinely active in this D1 database — it issues a bare
`DELETE FROM vehicles WHERE
id = ? AND tenant_id = ?` with no explicit child-table deletes in the
repository code at all, and service/fuel records are already confirmed (by every existing
vehicle-deletion test) to disappear with it.

**Alternatives considered**:

- **Explicit per-table `DELETE` statements for every cascading table**: rejected — strictly more
  code with strictly more chances to miss a table as the schema grows, for a guarantee the
  database's own foreign keys already provide. The single-vehicle deletion precedent already
  established that trusting the cascade is this project's convention, not a special case.
- **A destructive-migration-style manual verification (e.g. dry-run listing every row about to be
  deleted before committing)**: rejected as unnecessary ceremony for this project's scale — the
  cascade is deterministic and already covered by tenant-scoped tests.

## The one real gap: `magic_link_tokens`' email-only key

**Decision**: Before the cascading tenant delete, a new repository function deletes every
`magic_link_tokens` row whose `email` matches any of the tenant's users' email addresses, regardless
of that row's `linking_user_id` (which is `NULL` for an ordinary sign-in link and set only for an
account-linking confirmation link).

**Rationale**: An ordinary magic-link sign-in token is created _before_ the system knows which user
it belongs to (a returning visitor typing their email) — it's necessarily keyed by `email` alone,
with no `user_id` foreign key to attach to at creation time (confirmed in `0003`). The
`linking_user_id` column `0005` added is populated only for the separate account-linking
confirmation flow (an _already-authenticated_ user linking a second sign-in method) — those rows do
cascade correctly via that column. The gap is specifically the ordinary sign-in case: if an owner
requests a sign-in link, doesn't use it, and then deletes their account before it expires, that
token — containing their email in plaintext — would otherwise sit in D1 untouched until its own
natural expiry, surviving an erasure request that's supposed to be total (FR-006).

**Alternatives considered**:

- **Waiting for the token's own expiry**: rejected — this project's magic-link tokens are
  short-lived, but "eventually expires anyway" is exactly the kind of retention-after-erasure-
  request Principle VIII and this feature's own FR-006 rule out; the row must be gone the moment
  deletion completes, not sometime later.
- **Adding a `tenant_id` column to `magic_link_tokens` retroactively** (a schema change so it could
  cascade like everything else): rejected as disproportionate — a one-line
  `DELETE ... WHERE email
  IN (...)` in the erasure function achieves the same outcome without a
  migration touching a table every existing magic-link test already depends on the shape of.

## Confirmation gate: a required exact-match field in the request body

**Decision**: `DELETE /api/v1/account` requires a JSON body `{ "confirm": "DELETE MY ACCOUNT" }`
(the literal phrase, byte-exact). A missing or mismatched value is rejected with `400`, nothing is
touched. The client only ever sends this after the owner has typed the phrase themselves into a
confirmation field the deletion UI reveals — the phrase is never pre-filled or auto-submitted.

**Rationale**: This is the first destructive action in the app requiring more than a single click
(every other delete — a vehicle, a record, a reminder — is instant, no confirmation at all,
consistent with this project's established low-friction pattern for _recoverable_ mistakes). An
account deletion is irreversible by design (spec.md Assumptions: no soft delete, no recovery
window), which is exactly the case FR-002 exists for. Enforcing the check server-side (not just a
client-side "are you sure" dialog) means the requirement holds even against a scripted or replayed
request, not only a careless click in the real UI.

**Alternatives considered**:

- **A simple `{ "confirm": true }` boolean**: rejected — trivially satisfied by a script or a stray
  automated retry with no deliberate action behind it; a typed phrase requires the same kind of
  active engagement a real "are you sure, this cannot be undone" moment is supposed to produce.
- **Re-authentication (re-enter passkey/magic-link) at the moment of deletion**: rejected per
  spec.md's own Assumption — disproportionate ceremony for this project's scale, and the owner is
  already an authenticated, session-holding visitor; re-proving identity mid-session adds friction
  without addressing FR-002's actual concern (accidental single-click triggering), which a typed
  confirmation phrase already fully addresses.

## Ending the session after the account is already gone

**Decision**: After the D1 delete succeeds, the route (1) clears the session cookie
(`serializeExpiredSessionCookie()`, the same helper `POST /_dev/session/invalidate` already uses)
and (2) explicitly deletes the session's entry from the KV cache via a new `session.ts` export,
`clearSessionCache(kv, tokenHash)`. It does _not_ call the existing `invalidateSession` function.

**Rationale**: `resolveSession` is cache-aside (session.ts: "Cache-aside, not source of truth") — it
checks the KV cache (5-minute TTL) _before_ falling back to D1. If the deletion route only cleared
the cookie and left the KV entry alone, a request replaying the deleted account's session token
(e.g. a stolen cookie, a second tab that never reloads) would still resolve successfully from the
stale cache for up to 5 more minutes even though the `sessions` row is already gone — a direct
violation of FR-007 ("no further request may be honored as if they were still signed in") and
SC-005. Calling the existing `invalidateSession` does **not** fix this either: it first calls
`findValidSessionByTokenHash`, which returns null once the row is cascade-deleted, so the function
returns `false` immediately without ever reaching its own `kv.delete()` call — it's a silent no-op
post-deletion, not a safe alternative. The route already has the resolved session's `tokenHash`
available via `c.get("sessionTokenHash")` (set by `tenantContext`), so no extra lookup is needed to
clear the cache entry directly.

**Alternatives considered**:

- **Calling `invalidateSession` after the D1 delete** (the original decision here): rejected once
  traced through — it silently no-ops against an already-deleted session row, leaving the KV cache
  entry live for the remainder of its TTL. This was the gap this revision fixes.
- **Deleting the KV cache entry before the D1 delete, alongside the R2 cleanup**: rejected — ordering
  it after the D1 delete (but still explicitly, not by relying on `invalidateSession`) keeps the same
  R2-then-D1-then-cache sequence the rest of this route follows, and the cache entry does not need to
  be gone until the response is actually returned.
