# Tasks: GDPR Account Erasure

**Input**: Design documents from `/specs/016-gdpr-account-erasure/` **Prerequisites**: plan.md,
spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — full erasure correctness/completeness, tenant isolation, the
outstanding-magic-link-token edge case, and the confirmation-gate rejection paths, all via
`deno task test`. The confirmation UI itself has no automated test (no client test framework exists
in this project yet — established pattern from spec 014); verified live via `deno task dev`.

## Phase 1: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [ ] T001 [P] In `src/server/db/repository.ts`: add
      `listAttachmentKeysForTenant(db, ctx):
      Promise<string[]>` (all
      `service_record_attachments.r2_key` for `ctx.tenantId`, filtered directly on that table's own
      `tenant_id` column — no join needed) and
      `listAttachmentKeysForTenantFuelRecords(db, ctx): Promise<string[]>` (same, for
      `fuel_record_attachments`)
- [ ] T002 [P] In `src/server/db/repository.ts`: add
      `deleteOutstandingMagicLinkTokensForTenant(db, ctx): Promise<void>` — deletes every
      `magic_link_tokens` row whose `email` matches any user under `ctx.tenantId` (research.md: the
      one table with no foreign key to `user_id`/`tenant_id` at all)
- [ ] T003 In `src/server/db/repository.ts`: add
      `deleteTenantAccount(db, tenantId):
      Promise<boolean>` — a single
      `DELETE FROM tenants WHERE id = ?`, returning whether a row existed; relies entirely on the
      cascade chain confirmed in research.md, no per-table deletes

**Checkpoint**: The three erasure primitives exist and are independently unit-testable before any
route wires them together.

---

## Phase 2: User Story 1 - An owner permanently erases their account (P1) 🎯 MVP

**Goal**: A confirmed deletion request removes every table/object listed in data-model.md, leaves a
second tenant untouched, and the caller's session is unusable immediately afterward.

- [ ] T004 [US1] In `src/server/auth/session.ts`: add `clearSessionCache(kv: KVNamespace, tokenHash:
      string): Promise<void>` — deletes the cache-aside KV entry directly (research.md: the existing
      `invalidateSession` silently no-ops once the `sessions` row is already gone, since it looks the
      row up first and returns early — it does not reach its own `kv.delete()` call in that case).
      Then create `src/server/routes/v1/account.ts`: `DELETE /` behind `rateLimitBySession`.
      Validates the request body's `confirm` field against the exact literal phrase
      `"DELETE MY ACCOUNT"` (contracts/api.md) — `400` `{ error: "invalid_request" }` and nothing
      touched if missing or mismatched. On a valid confirmation: gather R2 keys via T001's two
      functions, delete those R2 objects, call T002's magic-link-token cleanup, then T003's
      `deleteTenantAccount` — in that order (research.md: R2 before D1, so a partial R2 failure
      never leaves an unrecoverable state). On success, clear both the session cookie
      (`serializeExpiredSessionCookie()`) and its KV cache entry (`clearSessionCache`, using
      `c.get("sessionTokenHash")` already set by `tenantContext`), then return `204`. Mount at
      `/api/v1/account` in `src/server/index.ts`
- [ ] T005 [P] [US1] Create `tests/server/account-erasure.test.ts` (core erasure section): 1. An
      account with a vehicle, a service record with an attachment, a fuel record with an attachment,
      and a reminder rule — confirmed deletion removes every D1 row and every R2 object (checked
      directly against storage, not only via the API). 2. An account with zero vehicles/records
      still deletes successfully. 3. An outstanding, unconsumed sign-in magic-link token for the
      account's email is gone after deletion. 4. A second tenant's vehicles/records/sessions are
      completely unaffected by the first tenant's deletion. 5. A request made with the now-deleted
      account's former session cookie is refused identically to an unauthenticated request — this
      MUST be checked against a session that was cache-warm (resolved at least once before deletion,
      so a stale KV cache entry would exist if `clearSessionCache` weren't called) to actually
      exercise the KV-cache gap, not just the D1-row-gone case. 6.
      (FR-008 atomicity, R2-before-D1 ordering) With a forced R2 deletion failure (mock/stub the R2
      binding to reject), the request fails and every D1 row for the account — vehicles, records,
      the tenant itself, and the session — is still present and queryable afterward; the account is
      left exactly as it was before the attempt

**Checkpoint**: `deno task test` passes for the full happy-path erasure guarantee — FR-001, FR-003
through FR-007, and FR-009 are all provable.

---

## Phase 3: User Story 2 - An owner is protected from an accidental, irreversible deletion (P2)

**Goal**: Nothing is deleted without the deliberate confirming step, both at the API contract level
and in the real UI a person would actually use.

- [ ] T006 [US2] Create `src/client/account.ts`
      (`deleteAccount(confirmPhrase: string):
      Promise<void>`, same `jsonFetch`-wrapper shape
      as `vehicles.ts`) and `src/client/components/AccountDeletion.tsx`: a warning explaining the
      action is permanent, a text input that must exactly match the required phrase before the final
      destructive button enables, styled per spec 008. Wire into `App.tsx` (alongside the existing
      account-management row — "Add another passkey", "Link Google account"); on success, clear
      local identity state and return to the signed-out `AuthScreen`, matching FR-007
- [ ] T007 [P] [US2] Extend `account-erasure.test.ts` (confirmation-gate section): 1. A deletion
      request with no `confirm` field is rejected (`400`) and the account is completely unaffected —
      every row and R2 object from before the request still exists. 2. A request with a `confirm`
      value that doesn't exactly match the required phrase is rejected the same way. 3. Following
      either rejection, the account's existing session continues to work normally for an ordinary
      request

**Checkpoint**: `deno task test` passes for the full rejection-path guarantee, and the live UI flow
(T008) proves a real person can't trigger deletion with a single ordinary click.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [ ] T008 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [ ] T009 Walk through quickstart.md end-to-end against `deno task dev`: seed a realistic account
      (vehicle, service/fuel records with attachments, a reminder rule, an outstanding unconsumed
      magic-link token), confirm the deletion flow blocks an incomplete confirmation attempt,
      complete deletion, confirm the app reflects a signed-out state immediately, confirm the
      earlier magic-link no longer works, and confirm a brand-new account created afterward is
      completely unaffected

## Dependencies

- **Phase 1 (Foundational)** → **all user story phases**: strict — neither story has anything to
  call until the three repository primitives exist.
- **User Story 1 (Phase 2)** → **User Story 2 (Phase 3)**: soft — T004's route already has to
  implement the confirmation check to match contracts/api.md at all (a route that deletes on any
  request isn't a complete implementation of the contract), so US1's own tests already prove the
  server-side gate exists; US2 adds the rejection-path test coverage and — the part that actually
  matters to a real person — the client UI that makes triggering deletion by accident genuinely
  hard, not just contractually forbidden.
- **Phase 4 (Polish)**: after everything else.

## Parallel execution examples

Within Phase 1, all three repository additions touch the same file but different, independent
functions with no dependency on each other:

```text
T001 [P] listAttachmentKeysForTenant / ...FuelRecords
T002 [P] deleteOutstandingMagicLinkTokensForTenant
```

(T003 has no listed dependency on T001/T002 either, but is left unmarked since it's the simplest,
fastest task and sequencing it last costs nothing.)

## Implementation strategy

**MVP = Phase 1 + Phase 2 (User Story 1).** A working, contract-complete deletion endpoint —
including its own confirmation-field validation — is independently valuable and already proves every
erasure guarantee this feature exists for; User Story 2 rounds it out with the client experience and
explicit rejection-path test coverage that make the protection real for an actual person, not just
present in the API contract.
