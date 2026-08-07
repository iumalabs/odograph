# Tasks: API Tokens

**Input**: Design documents from `/specs/017-api-tokens/` **Prerequisites**: plan.md, spec.md,
data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — plan.md's Testing section explicitly calls for `deno task test` coverage of
creation/list/revoke, dual-auth resolution, read-scope write-blocking, the session-only boundary,
revocation, and last-used updates. The token-management UI itself has no automated test (no client
test framework exists in this project yet — established pattern from specs 014/016); verified live
via `deno task dev`.

## Phase 1: Setup

- [ ] T001 Create `migrations/0012_api_tokens.sql` per data-model.md: `api_tokens` table (`id`,
      `user_id ... ON DELETE CASCADE`, `label`, `scope CHECK (scope IN ('read', 'write'))`,
      `token_hash UNIQUE`, `created_at`, `last_used_at`, `revoked_at`) plus
      `idx_api_tokens_user_id`/`idx_api_tokens_token_hash` indexes

---

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [ ] T002 In `src/server/db/repository.ts`: add the `ApiToken` type and
      `createApiToken(db, ctx, input: { label, scope, tokenHash }): Promise<ApiToken>`,
      `listApiTokens(db, ctx): Promise<ApiToken[]>` (ordered by `created_at`, never selects
      `token_hash`),
      `findValidApiTokenByHash(db, tokenHash): Promise<(ResolvedSession & {
      apiTokenId: string; scope: "read" | "write" }) | null>`
      (JOIN `users`, filtered to `revoked_at IS NULL`, mirroring `findValidSessionByTokenHash`'s
      shape), `touchApiTokenLastUsed(db, apiTokenId): Promise<void>`, and
      `revokeApiToken(db, ctx, id):
      Promise<boolean>` (sets `revoked_at`,
      not-found-or-not-yours contract like `deleteVehicle`)
- [ ] T003 In `src/server/middleware/tenant-context.ts`: add `tenantContextOrToken` alongside the
      existing `tenantContext` (unchanged). Resolves a session cookie via the existing
      `resolveSession` first; if absent, parses `Authorization: Bearer <token>`, hashes it (reusing
      `session.ts`'s `sha256Hex` — export it if not already), and resolves via T002's
      `findValidApiTokenByHash`. Either path sets `c.set("tenant", ...)` and
      `c.set("sessionTokenHash", ...)` (the resolved session's or token's hash — research.md's
      rate-limit-reuse decision, requires no `rate-limit.ts` change). On token resolution, also
      calls `touchApiTokenLastUsed` and sets `c.set("authScope", "read" | "write")`; a session
      resolution sets `authScope` to `"session"`. Immediately after resolving, if
      `authScope ===
      "read"` and `c.req.method` is not `GET`/`HEAD`, returns
      `403 { error: "read_only_token" }` before any route handler runs (research.md's centralized
      read-scope enforcement). Add `authScope: "session" | "read" | "write"` to `AppEnv`'s
      `Variables` in `src/server/types.ts`

**Checkpoint**: Token resolution, rate-limit-key reuse, and read-scope enforcement all exist and are
exercised once wired into a route — no user story can be tested end-to-end until this phase and at
least one story's routing changes land.

---

## Phase 3: User Story 1 - An owner creates a token and uses it for programmatic access (P1) 🎯 MVP

**Goal**: An owner can create a token, see its value once, and use it (not a session cookie) to read
and write their own data through the existing resource routes — while a read-only token can read but
not write, and no token (any scope) can manage tokens or delete the account.

- [ ] T004 [US1] Create `src/server/routes/v1/tokens.ts`: `POST /` (cookie-only `tenantContext`,
      `rateLimitBySession`) — validates `{ label: string (non-empty), scope: "read" | "write" }`,
      `400 { error: "invalid_request" }` if invalid, nothing created. On success: generates a token
      (32 random bytes, base64url, `odo_` prefix — research.md), hashes it, calls T002's
      `createApiToken`, returns `201` with the row plus the one-time plaintext `token` field
      (contracts/api.md). `GET /` (cookie-only `tenantContext`) — calls T002's `listApiTokens`,
      returns `{ tokens: ApiToken[] }`, never a plaintext or hash. Mount at `/api/v1/tokens` in
      `src/server/index.ts`
- [ ] T005 [US1] In `src/server/routes/v1/vehicles.ts`, `service-records.ts`, `fuel-records.ts`, and
      `reminder-rules.ts`: swap each file's `.use("*", tenantContext)` to
      `.use("*",
      tenantContextOrToken)` (one line per file, importing T003's new export
      instead of/alongside the existing one — research.md's file-level swap decision)
- [ ] T006 [P] [US1] Create `src/client/api-tokens.ts`:
      `createApiToken(label, scope):
      Promise<ApiToken & { token: string }>` and
      `listApiTokens(): Promise<ApiToken[]>` (same `jsonFetch`-wrapper shape as `vehicles.ts`)
- [ ] T007 [US1] Create `src/client/components/ApiTokens.tsx`: a label input + read-only/read-write
      choice + create button; on success, displays the returned plaintext token prominently with a
      copy affordance and an explicit "shown only once" warning, then shows the token list (label,
      scope, created-at) below, styled per spec 008. Wire into `App.tsx`'s existing
      account-management row
- [ ] T008 [P] [US1] Create `tests/server/api-tokens.test.ts` (core section): 1. Creating a token
      returns its plaintext once; a subsequent list call never includes it (plaintext or hash). 2. A
      read-write token used via `Authorization: Bearer` on an existing route (e.g.
      `POST
      /api/v1/vehicles`) succeeds identically to a session cookie. 3. A read-only token
      succeeds on a `GET` and is refused (`403 read_only_token`) on a `POST`/`PATCH`/`DELETE`, with
      nothing changed. 4. A read-write token used against `POST /api/v1/tokens`,
      `GET /api/v1/tokens`, and `DELETE /api/v1/account` (spec 016) is refused (`401`, no
      `Authorization`-aware resolution on those routes) — token management and account deletion stay
      session-only regardless of scope. 5. A missing/malformed/unknown token with no session cookie
      present is refused `401`, identical to today's no-session behavior. 6. (FR-012 tenant
      isolation) A token belonging to one owner used against another owner's resource (e.g. a
      vehicle id that belongs to a second, separately-created tenant) is refused identically to a
      made-up id — exactly like the existing session-cookie tenant-isolation guarantee

**Checkpoint**: `deno task test` passes for FR-001 through FR-006 and FR-012/FR-013 — a token can be
created, used for real programmatic access, correctly scope-limited, and correctly barred from the
two most sensitive route groups.

---

## Phase 4: User Story 2 - An owner revokes a token they no longer trust (P2)

**Goal**: Revoking a token takes effect immediately and doesn't disturb the owner's other tokens.

- [ ] T009 [US2] In `src/server/routes/v1/tokens.ts`: add `DELETE /:id` (cookie-only
      `tenantContext`, `rateLimitBySession`) calling T002's `revokeApiToken`; `204` whether or not
      the token was already revoked (idempotent, contracts/api.md), `404` if the id doesn't exist or
      belongs to another owner
- [ ] T010 [US2] In `src/client/api-tokens.ts`: add `revokeApiToken(id): Promise<void>`. In
      `ApiTokens.tsx`: add a revoke button per token row; a revoked token is shown clearly marked
      (research.md's soft-revoke decision) rather than removed from the list
- [ ] T011 [P] [US2] Extend `api-tokens.test.ts` (revocation section): 1. A token used successfully
      once, then revoked, is refused on its very next use — identically to a token that was never
      issued. 2. Revoking one of an owner's several tokens leaves the others fully working. 3. A
      revoked token's list entry shows a revoked state distinguishable from an active token's

**Checkpoint**: `deno task test` passes for FR-008/FR-009/SC-004 — revocation is real and immediate,
and scoped only to the token being revoked.

---

## Phase 5: User Story 3 - An owner reviews their tokens for unexpected use (P3)

**Goal**: The token list surfaces last-used information accurately enough for an owner to notice
unexpected use.

- [ ] T012 [US3] In `ApiTokens.tsx`: display each token's last-used time in the list, with an
      explicit "never used" state when `lastUsedAt` is `null`
- [ ] T013 [P] [US3] Extend `api-tokens.test.ts` (last-used section): 1. A newly created token's
      `lastUsedAt` is `null` before its first use. 2. After one successful token-authenticated
      request, `lastUsedAt` reflects that use. 3. After a second successful request, `lastUsedAt`
      updates again (not stuck at the first value)

**Checkpoint**: `deno task test` passes for FR-010/SC-005 — the last-used signal this feature's
threat model depends on is accurate and live.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T014 [P] Extend `api-tokens.test.ts` (cross-cutting section): deleting the owner's account
      (existing `DELETE /api/v1/account`, spec 016) removes every one of their tokens — confirmed
      directly against D1 storage, and a subsequent request using any of those tokens' former values
      is refused identically to a token that was never issued (FR-011/SC-006)
- [ ] T015 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [ ] T016 Walk through quickstart.md end-to-end against `deno task dev`: create a read-write token,
      use it for a real read and write, create a read-only token and confirm its write is blocked,
      confirm neither token can manage tokens or delete the account, revoke a token and confirm it's
      immediately dead, delete the account and confirm every token is gone

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: the table must exist before any repository
  function referencing it can be exercised.
- **Phase 2 (Foundational)** → **all user story phases**: strict — no story has anything to call or
  route through until the repository primitives and `tenantContextOrToken` exist.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: soft — revocation needs a token to exist
  first (US1 creates one), but the revoke route/tests themselves don't depend on any US1 code beyond
  that a token can be created; both build on the same `tokens.ts` file.
- **User Story 1 (Phase 3)** → **User Story 3 (Phase 5)**: soft — same reasoning; last-used display
  needs a token and at least one authenticated request to exist, both of which US1 already
  exercises.
- **Phase 6 (Polish)**: after everything else.

## Parallel execution examples

Within Phase 3, the client wrapper and the test file touch different files with no dependency on
each other once T004/T005 exist:

```text
T006 [P] src/client/api-tokens.ts
T008 [P] tests/server/api-tokens.test.ts
```

Within Phase 4 and Phase 5, each phase's test-extension task `[P]` is independent of that phase's UI
task, since they touch different files.

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** A token that can be created, used for real
programmatic read/write access, correctly scope-limited, and correctly barred from managing tokens
or the account is independently valuable and already proves Principle VI's core guarantees; User
Story 2 (revocation) and User Story 3 (last-used visibility) round out the safety story the MVP's
own scoping already depends on being trustworthy.
