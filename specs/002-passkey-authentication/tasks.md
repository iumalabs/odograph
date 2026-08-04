# Tasks: Passkey Authentication (Primary Sign-In Method)

**Input**: Design documents from `/specs/002-passkey-authentication/` **Prerequisites**: plan.md,
spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — fixture-based server-side verification tests (`fido2-helpers`, see
research.md) plus logic tests that don't need real WebAuthn crypto.

## Phase 1: Setup

- [ ] T001 Add `@simplewebauthn/server` and `@simplewebauthn/browser` to `package.json`
      dependencies, `fido2-helpers` to `devDependencies`
- [ ] T002 Smoke-test runtime compatibility: a throwaway call to `generateRegistrationOptions()`
      from within a Vitest test running under `@cloudflare/vitest-pool-workers` (the real `workerd`
      runtime, not Node) — confirms research.md's residual risk (no explicit Workers support claim
      in the library's own docs) before building anything on top. Delete or fold this into T011 once
      real tests exist.
- [ ] T003 Create D1 migration `migrations/0002_webauthn_credentials.sql` (tables
      `webauthn_credentials`, `webauthn_challenges` per data-model.md)

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [ ] T004 Apply the migration locally: `wrangler d1 migrations apply odograph-preview --local`
- [ ] T005 [P] Add repository functions to `src/server/db/repository.ts` per data-model.md's
      "Repository layer additions": `createCredentialedUser` (D1 `batch()` — tenant + user +
      credential atomically, FR-010), `findCredentialById`, `addCredentialToUser`,
      `updateCredentialCounter`, `createChallenge`, `consumeChallenge` (atomic check-and-delete). No
      existing export's signature changes.
- [ ] T006 [P] Implement `src/server/auth/passkey.ts`: wraps `@simplewebauthn/server`'s
      `generateRegistrationOptions`/`verifyRegistrationResponse`/`generateAuthenticationOptions`/
      `verifyAuthenticationResponse`. Derives `rpID`/`expectedOrigin` from the request URL
      (research.md — no static config). Registration options set
      `authenticatorSelection.residentKey: "required"` (discoverable credentials, research.md).
      Login options omit `allowCredentials` entirely.

**Checkpoint**: Repository + ceremony-wrapping module exist and type-check. No route wires them
together yet.

---

## Phase 3: User Story 1 - A new visitor creates an account with a passkey (P1) 🎯 MVP

**Goal**: Complete a registration ceremony end-to-end, landing in a working session scoped to a
brand-new tenant — with nothing created if the ceremony doesn't complete (FR-010).

**Independent Test**: Per spec.md — complete a passkey registration ceremony (via fixture response
in tests, via a real browser in quickstart.md) and confirm a session is issued that resolves to a
brand-new tenant.

- [ ] T007 [US1] Implement `POST /api/v1/auth/passkey/register/options` in
      `src/server/routes/v1/auth/passkey.ts`: calls `createChallenge(db, "registration")`, calls
      `passkey.ts`'s option-generation, returns the options JSON (contracts/api.md)
- [ ] T008 [US1] Implement `POST /api/v1/auth/passkey/register/verify`: consumes the challenge
      (`consumeChallenge` — 400 if invalid/expired/already used), calls
      `verifyRegistrationResponse`, on success calls `createCredentialedUser` then `issueSession`
      and sets the cookie; on a credential-ID primary-key conflict, returns 400 without any partial
      writes (FR-006 — the `batch()` call from T005 makes this atomic, not a check-then-insert race)
- [ ] T009 [US1] Wire the two routes into `src/server/index.ts` under
      `/api/v1/auth/passkey/register`, with `rateLimitByIp` applied to both (no session exists yet —
      same pattern as the existing dev-session route)
- [ ] T010 [P] [US1] Write `tests/server/passkey-auth.test.ts` (registration section) covering
      spec.md's User Story 1 Acceptance Scenarios 1-3 using `fido2-helpers`'s
      `challengeResponseAttestationNoneMsgB64Url` fixture (adapted to `RegistrationResponseJSON`'s
      shape — add `type: "public-key"`, `clientExtensionResults: {}` if the fixture doesn't already
      include them): successful registration creates exactly one tenant/user/credential and issues a
      working session; submitting the same fixture response twice (simulating a retry) does not
      create a second tenant/user for the same credential (FR-006); a request with a stale/unknown
      challenge is rejected before any row is written

**Checkpoint**: User Story 1 is independently complete and testable — `npm test` passes for the
registration portion of `passkey-auth.test.ts`, and quickstart.md step 3.1 works against
`wrangler dev` with a real platform authenticator.

---

## Phase 4: User Story 2 - A returning user signs in with a passkey (P1)

**Goal**: Complete a login ceremony end-to-end for an existing credential, resolving to the same
tenant every time — never a new one.

**Independent Test**: Per spec.md — register a passkey, end that session, start a fresh login
ceremony with the same passkey, confirm it resolves to the same user/tenant.

- [ ] T011 [US2] Implement `POST /api/v1/auth/passkey/login/options`: calls
      `createChallenge(db, "authentication")`, generates options with no `allowCredentials`, returns
      the options JSON
- [ ] T012 [US2] Implement `POST /api/v1/auth/passkey/login/verify`: consumes the challenge, looks
      up the credential via `findCredentialById` using the response's credential ID (401 — not 404 —
      if not found, matching FR-004's "don't reveal which case it was"), calls
      `verifyAuthenticationResponse` with the stored public key/counter, rejects (401) if the
      authenticator's reported counter isn't strictly greater than the stored one (clone detection,
      data-model.md Validation rules), otherwise calls `updateCredentialCounter` and `issueSession`
      for the credential's existing user
- [ ] T013 [US2] Wire the two routes into `src/server/index.ts` under `/api/v1/auth/passkey/login`,
      with `rateLimitByIp` applied to both
- [ ] T014 [P] [US2] Extend `tests/server/passkey-auth.test.ts` (login section) covering User Story
      2 Acceptance Scenarios 1-3 using `fido2-helpers`'s `assertionResponseMsgB64Url` fixture
      (register that fixture's own credential ID/public key first via the repository directly, so
      the login attempt has something real to verify against): successful login resolves to the
      credential's existing tenant, not a new one; a response for an unregistered credential ID is
      rejected with the same status/shape as an invalid response (SC-003); an authenticator counter
      that doesn't advance is rejected

**Checkpoint**: `npm test` passes for the login portion; quickstart.md steps 3.2-3.3 work against
`wrangler dev`.

---

## Phase 5: User Story 3 - A user registers a second passkey (P2)

**Goal**: An authenticated user can add a second passkey; either one signs them into the same
account afterward.

**Independent Test**: Per spec.md — with an authenticated session, register a second passkey,
confirm both are independently usable to sign in to the same account.

- [ ] T015 [US3] Implement `POST /api/v1/auth/passkey/add/options` and
      `POST /api/v1/auth/passkey/add/verify` (contracts/api.md): both behind `tenantContext`
      (existing middleware — requires a valid session, unlike registration/login). `verify` calls
      `addCredentialToUser` for `c.get("tenant").userId` instead of `createCredentialedUser`;
      returns 409 (not 400) on a credential already registered to any account, matching User Story 3
      Scenario 2's "reject rather than move/ambiguity" requirement
- [ ] T016 [US3] Wire the two routes into `src/server/index.ts` under `/api/v1/auth/passkey/add`,
      with `tenantContext` then `rateLimitBySession` (an authenticated write path — matches the
      existing tenant-isolation-probe route's middleware order)
- [ ] T017 [P] [US3] Extend `tests/server/passkey-auth.test.ts` (multi-credential section) covering
      User Story 3 Acceptance Scenarios 1-2: registering a second credential for an authenticated
      user succeeds and both credentials independently resolve to the same user afterward;
      attempting to add a credential ID already registered (reusing a fixture already consumed in an
      earlier test) returns 409

**Checkpoint**: `npm test` passes for the multi-credential section.

---

## Phase 6: Minimal client UI

**Goal**: A feature with no way to trigger it isn't independently testable end-to-end (plan.md) —
minimal, unstyled buttons wired to the four public-facing endpoints.

- [ ] T018 [P] Implement `src/client/auth/passkey.ts`: thin wrapper calling `/register/options` →
      `@simplewebauthn/browser`'s `startRegistration()` → `/register/verify`, and the equivalent
      `startAuthentication()` pair for login
- [ ] T019 Modify `src/client/App.tsx`: minimal "Sign up with passkey" / "Sign in with passkey"
      buttons calling the T018 wrapper, showing the returned `userId`/`tenantId` on success (just
      enough to prove the ceremony worked end-to-end per quickstart.md — no visual design; that's a
      separate future pass once the Claude-design mockups are integrated)

## Phase 7: Polish & Cross-Cutting

- [ ] T020 [P] Update `src/server/db/schema.sql` reference copy with the two new tables
- [ ] T021 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [ ] T022 Walk through quickstart.md end-to-end against `wrangler dev` with a real platform
      authenticator (Touch ID / Windows Hello / a security key); update quickstart.md if any step
      drifted during implementation

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: strict — the migration and dependencies must
  exist before any code using them type-checks.
- **Phase 2 (Foundational)** → **all user story phases**: strict — repository additions and the
  ceremony-wrapping module are shared by every story.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: soft in principle (login could be tested
  against a credential inserted directly via the repository, without registration's routes existing)
  but kept in order since registration is the natural way a test credential exists.
- **User Story 1/2 (Phase 3/4)** → **User Story 3 (Phase 5)**: soft, same reasoning — adding a
  _second_ passkey presupposes a first one and an authenticated session, both of which Phase 3/4
  provide.
- **Phase 6 (Client UI)** → after Phase 3 and 4 at minimum (needs the register/login endpoints to
  call); Phase 5's "add" endpoint is optional for the client UI's first cut.
- **Phase 7 (Polish)**: after all story phases.

## Parallel execution examples

Within Phase 2, T005 and T006 touch different files and have no dependency on each other:

```text
T005 [P] src/server/db/repository.ts
T006 [P] src/server/auth/passkey.ts
```

Within Phase 3, T010 (tests) can be written in parallel with T007-T009 (implementation), then run
once both land:

```text
T007 src/server/routes/v1/auth/passkey.ts (register/options)
T008 src/server/routes/v1/auth/passkey.ts (register/verify)
T009 src/server/index.ts
T010 [P] tests/server/passkey-auth.test.ts (registration section)
```

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** Registration alone proves the ceremony works
end-to-end against the real `workerd` runtime (de-risking research.md's one open question) and
unblocks everything else. User Story 2 (login) is equally high-priority per spec.md but depends on
Phase 3 existing to have something to log into during testing. User Story 3 and the client UI are
lower-risk, incremental additions once both ceremonies are proven.
