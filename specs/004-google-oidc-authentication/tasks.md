# Tasks: Google OIDC Authentication

**Input**: Design documents from `/specs/004-google-oidc-authentication/` **Prerequisites**: plan.md,
spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — fixture-based ID token verification (no real Google network call in the
automated suite, per research.md) plus the D-004 cross-method isolation check the spec calls out
explicitly.

> Updated after `/speckit-analyze`: T010/T012/T013 now split the callback handler so the
> code-for-tokens exchange (a real network call, deliberately untested — finding C1, same shape as
> specs/003's `send_email` 502 path) is separate from `completeGoogleSignIn`, the verify+resolve+
> issue-session step that T012/T013 test directly with fixture ID tokens rather than through
> `SELF.fetch` to `/callback`. T012 also gained an `email_verified: false` case (finding M1).

## Phase 1: Setup

- [X] T001 [P] Add the `jose` dependency: `npm install jose`
- [X] T002 [P] Extend `AppEnv["Bindings"]` in `src/server/types.ts` with
      `GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string` — these are Workers secrets
      (research.md), never declared in `wrangler.toml`, so `wrangler types`/`npm run cf-typegen`
      never generates them onto `Env`; this manual intersection is what makes them type-checked
- [X] T003 Create D1 migration `migrations/0004_oidc.sql` (tables `oidc_identities`, `oidc_states`
      per data-model.md)

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T004 Apply the migration locally: `wrangler d1 migrations apply odograph-preview --local`
- [X] T005 [P] Add repository functions to `src/server/db/repository.ts` per data-model.md's
      "Repository layer additions": `findOidcIdentityByProviderAndSubject`, `createOidcUser` (D1
      `batch()` — tenant + user + identity atomically, FR-006), `createOidcState`,
      `consumeOidcState` (atomic check-and-delete, mirroring `consumeChallenge`/
      `consumeMagicLinkToken`). No existing export's signature changes.
- [X] T006 [P] Implement `src/server/auth/oidc/verify-id-token.ts`: `verifyGoogleIdToken(idToken,
      { jwks, issuer, audience })` using `jose`'s `jwtVerify` — `jwks` is an injectable
      `JWTVerifyGetKey` (research.md's testing strategy: production passes
      `createRemoteJWKSet(new URL(GOOGLE_JWKS_URI))`, tests pass a local fixture JWKS), `issuer`
      checked against both `https://accounts.google.com` and `accounts.google.com` (research.md).
      Returns the verified claims (`sub`, `email`, `email_verified`) or throws.
- [X] T007 [P] Implement `src/server/auth/oidc/google.ts`: endpoint constants (authorization/token/
      JWKS URLs, research.md), PKCE `code_verifier`/`code_challenge` (S256) generation via Web
      Crypto (`crypto.getRandomValues`, `crypto.subtle.digest`), an authorization-URL builder
      (`client_id`, `redirect_uri`, `response_type=code`, `scope=openid email profile`, `state`,
      `code_challenge`, `code_challenge_method=S256`), and a code-for-tokens exchange function
      (`fetch()` to the token endpoint with `client_secret`, catches and surfaces failures rather
      than swallowing them, same FR-008-of-specs/003 posture)
- [X] T008 [P] Create `tests/server/fixtures/oidc.ts`: generate a fixture EC keypair via
      `crypto.subtle.generateKey`, sign a fixture Google-shaped ID token (`iss`, `aud`, `sub`,
      `email`, `email_verified`, `iat`, `exp`) using `jose`'s `SignJWT`, and export a matching local
      JWKS (`jose`'s `exportJWK`/`createLocalJWKSet`) for `verify-id-token.ts`'s injectable `jwks`
      parameter — mirrors `tests/server/fixtures/webauthn.ts`'s role for passkey.

**Checkpoint**: Repository additions, ID token verification, and Google's HTTP-level helpers exist,
type-check, and are provably correct against a fixture — no real Google credentials needed yet.

---

## Phase 3: User Story 1 - A new visitor signs up with their Google account (P1) 🎯 MVP

**Goal**: Complete start → Google consent → callback → session end-to-end, with the D-004-safe
identity check (FR-003a) and no-partial-state guarantee (FR-006).

**Independent Test**: Per spec.md — starting from no account, complete the flow with a fixture ID
token for a subject never seen before and confirm a session is issued for a brand-new tenant; a
second callback for the same subject resolves to the same tenant.

- [X] T009 [US1] Implement `GET /api/v1/auth/oidc/google/start` in
      `src/server/routes/v1/auth/oidc/google.ts`: calls `createOidcState`, builds the authorization
      URL (google.ts), redirects (302) — contracts/api.md
- [X] T010 [US1] Implement `completeGoogleSignIn(db, idToken, { jwks, issuer, audience })` in
      `src/server/auth/oidc/google.ts` — the directly-testable core (analyze finding C1): verifies
      the ID token (verify-id-token.ts); on verification failure, returns a distinguishable failure
      result (caller redirects to `/?oidc=error`, nothing written, FR-006); on success, looks up
      `findOidcIdentityByProviderAndSubject` for `('google', sub)` — on no match, calls
      `createOidcUser` with the verified `sub`/`email` (FR-006; `email_verified` is stored but never
      gates this — FR-009); on a match, uses that existing `userId` (FR-003) — then `issueSession`
      and returns the cookie. Implement `GET /api/v1/auth/oidc/google/callback` in
      `src/server/routes/v1/auth/oidc/google.ts` as a thin wrapper: rejects immediately (redirect to
      `/?oidc=error`) if Google returned `?error=...` (e.g. consent denied) or `state`/`code` are
      missing, before any DB access; consumes `state` via `consumeOidcState` (invalid/expired →
      `/?oidc=error`); exchanges `code` for tokens via google.ts's `exchangeCodeForTokens` (real
      network call — deliberately not unit tested, same posture specs/003 took for `send_email`'s
      502 path); calls `completeGoogleSignIn` with the resulting ID token and either sets the
      session cookie and redirects to `/?oidc=ok`, or redirects to `/?oidc=error`
- [X] T011 [US1] Wire both routes into `src/server/index.ts` under `/api/v1/auth/oidc/google`, with
      `rateLimitByIp` applied to `/start` only — `/callback` carries its own single-use secret
      (`state`) and is not separately rate-limited (contracts/api.md, same reasoning magic-link's
      `/verify` gave)
- [X] T012 [P] [US1] Write `tests/server/oidc-auth.test.ts` (lifecycle section) — cases 1, 2, 5, and
      6 call `completeGoogleSignIn` directly with a fixture ID token (T008's local JWKS), never via
      `SELF.fetch`, since reaching them requires a verified ID token in hand without a real Google
      network call (analyze finding C1); cases 3 and 4 short-circuit *before* the code exchange, so
      they're tested via the full HTTP route as usual. 1. A fixture ID token for a subject never
      seen before creates exactly one tenant/user/identity and returns a working session cookie. 2.
      A second call with the *same* subject resolves to the same tenant, not a new one. 3. A `GET
      /callback` with a `state` value that was never issued by `/start` (or already consumed)
      redirects to `/?oidc=error` with no cookie and no new rows (via `SELF.fetch`). 4. A `GET
      /callback` carrying `?error=access_denied` (simulating the user declining Google's consent
      screen) redirects to `/?oidc=error` before any state lookup or DB write (via `SELF.fetch`). 5.
      A fixture ID token that fails verification (wrong audience, expired, or bad signature) is
      rejected by `completeGoogleSignIn` with no session issued and no identity/user/tenant created.
      6. A fixture ID token with `email_verified: false` still resolves/creates an account exactly
      like any other — the field is stored but never gates or changes resolution behavior (FR-009,
      analyze finding M1).

**Checkpoint**: User Story 1 is independently complete and testable — `npm test` passes for the
lifecycle section, and quickstart.md steps 1-4 work against `wrangler dev`/`npm run dev` with real
Google credentials once they exist (T019 tracks that separately, per research.md's residual-risk
note — this checkpoint doesn't block on it).

---

## Phase 4: User Story 2 - A returning user signs in, and cross-method isolation holds (P1)

**Goal**: Prove the two properties spec.md's User Story 2 commits to: a returning Google user always
lands in their own tenant (already covered by T012 case 2), and a Google sign-in never silently
signs into an account created by a different method (D-004/FR-003a).

**Independent Test**: Per spec.md — seed an account via passkey for a given email, then complete a
Google callback whose fixture ID token reports that same email; confirm the resulting tenant is
distinct from the passkey account's.

- [X] T013 [P] [US2] Extend `tests/server/oidc-auth.test.ts` (isolation section): seed a passkey
      account directly via `createCredentialedUser` (reused from specs/002, same pattern
      specs/003's T012 used) for a given email, then call `completeGoogleSignIn` directly (same
      reasoning as T012's cases 1/2/5/6 — analyze finding C1) with a fixture ID token reporting that
      exact email but a `sub` never seen before — confirm the resulting `tenantId` is different from
      the passkey account's (D-004), proving resolution never falls back to `users.email`.

**Checkpoint**: `npm test` passes for the isolation section.

---

## Phase 5: User Story 3 - The identity schema is provider-agnostic by construction (P3)

**Goal**: Confirm FR-008 holds by inspection — no code change, a verification task.

**Independent Test**: Per spec.md — a reviewer reads the `oidc_identities` schema and repository
function signatures and confirms `provider` is a stored data value, not implied by any table/column
name, so a second provider is a data/config change, not a migration.

- [X] T014 [P] [US3] Review `migrations/0004_oidc.sql`, `data-model.md`, and
      `findOidcIdentityByProviderAndSubject`/`createOidcUser`'s signatures (both take `provider` as
      an explicit parameter, per T005) and confirm none of them hard-code `'google'` outside the
      `src/server/auth/oidc/google.ts` and `src/server/routes/v1/auth/oidc/google.ts` files
      themselves — those two are legitimately Google-specific; a second provider adds sibling files
      beside them (e.g. `oidc/microsoft.ts`), not changes within them. Record the confirmation (or
      any fix needed) in this task's completion note.

---

## Phase 6: Client UI

**Goal**: A way to trigger the flow, matching passkey/magic-link's "minimal, no design polish"
precedent (plan.md). Unlike the other two methods, this is a plain navigation, not a fetch-driven
ceremony — no client-side crypto or JS library involved.

- [X] T015 [P] Implement `src/client/auth/oidc.ts`: exports the `/api/v1/auth/oidc/google/start`
      path as a named constant, so `App.tsx` doesn't hardcode the string (matches passkey/
      magic-link's pattern of a thin `auth/` wrapper even though there's no ceremony logic to wrap
      here)
- [X] T016 Modify `src/client/App.tsx`: a "Continue with Google" link (`<a href>`, not a `<button>`
      with a `fetch()` handler, since this is a full-page redirect) next to the existing passkey/
      magic-link controls; reads `?oidc=ok`/`?oidc=error` from `location.search` on mount, reusing
      the same outcome-banner pattern magic-link's `?magicLink=ok/error` handling already
      established — new UI string routed through `src/client/i18n/strings.ts`, not hardcoded
      (constitution Principle IX)

## Phase 7: Polish & Cross-Cutting

- [X] T017 [P] Update `src/server/db/schema.sql` reference copy with the two new tables
- [X] T018 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [ ] T019 **Live smoke test** (research.md's residual-risk mitigation, matching specs/003's T007):
      once a real Google OAuth client exists (quickstart.md step 1 — an external, owner-performed
      action this agent cannot do on its own), walk through quickstart.md steps 2-4 against
      `npm run dev`. Confirm a real Google sign-in actually issues a session, a repeat sign-in
      resolves to the same tenant, and declining consent produces `/?oidc=error` with no rows
      written. Record the outcome in this task's completion note — if this reveals anything the
      fixture-based tests couldn't (e.g. a claim shape mismatch with what Google actually returns),
      flag it before considering this feature done rather than building further on an unverified
      assumption.

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: strict.
- **Phase 2 (Foundational)** → **all user story phases**: strict — repository, ID token
  verification, and Google HTTP helpers are shared by every story.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: soft — Phase 4's isolation test reuses
  Phase 3's callback route; its same-tenant-on-repeat property is already partly proven by T012
  case 2, so Phase 4 only adds the cross-method isolation case.
- **User Story 3 (Phase 5)**: no code dependency on Phases 3-4 — could run any time after Phase 2,
  grouped here by priority order per spec.md.
- **Phase 6 (Client UI)** → after Phase 3 at minimum (needs `/start` to exist).
- **Phase 7 (Polish)**: after all story phases. T019 is the only task blocked on an external,
  owner-performed prerequisite (quickstart.md step 1) — everything else in this feature does not
  depend on it.

## Parallel execution examples

Within Phase 2, T005/T006/T007/T008 touch different files and have no dependency on each other:

```text
T005 [P] src/server/db/repository.ts
T006 [P] src/server/auth/oidc/verify-id-token.ts
T007 [P] src/server/auth/oidc/google.ts
T008 [P] tests/server/fixtures/oidc.ts
```

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** That delivers the core "Google in, session
out" flow, fully provable against fixtures without needing real Google credentials. User Story 2's
isolation test and User Story 3's inspection harden and verify the already-working design rather
than changing its shape, so they're safe to follow rather than block on. T019's live smoke test is
deliberately last — the same "prove the crypto path with fixtures first, hit the one genuinely
external dependency last" ordering specs/003 used for `send_email`.
