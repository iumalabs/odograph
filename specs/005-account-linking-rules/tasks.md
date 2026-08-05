# Tasks: Account Linking Rules

**Input**: Design documents from `/specs/005-account-linking-rules/` **Prerequisites**: plan.md,
spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — link-then-sign-in lifecycle and reject-already-linked (own/different account)
for both methods, plus the unauthenticated-refusal case (FR-004).

> Updated after `/speckit-analyze`: T005 now replaces `sendMagicLinkEmail`'s binary `isNewAccount`
> param with a three-way `purpose` so linking emails get accurate copy instead of misleadingly
> claiming to be a signup or plain sign-in email (finding M1). spec.md's SC-003 wording corrected —
> the rejection check is same-method seeding, not cross-method (finding L1).

## Phase 1: Setup

- [X] T001 Create D1 migration `migrations/0005_account_linking.sql`: `ALTER TABLE
      magic_link_tokens ADD COLUMN linking_user_id TEXT REFERENCES users(id) ON DELETE CASCADE;`
      and `ALTER TABLE oidc_states ADD COLUMN linking_user_id TEXT REFERENCES users(id) ON DELETE
      CASCADE;` per data-model.md

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T002 Apply the migration locally: `wrangler d1 migrations apply odograph-preview --local`
- [X] T003 In `src/server/db/repository.ts`, per data-model.md: add an optional trailing
      `linkingUserId?: string` param to `invalidateAndCreateMagicLinkToken` (included in the
      `INSERT` when present); add `linkingUserId: string | null` to `consumeMagicLinkToken`'s
      returned object; add the same two changes, mirrored, to `createOidcState`/`consumeOidcState`;
      add `linkMagicLinkIdentity(db, email, userId)` and `linkOidcIdentity(db, provider, subject,
      userId)` — both plain inserts with no existence pre-check, relying on the primary key
      constraint to reject an already-linked identity (research.md). No other existing export's
      signature changes.
- [X] T004 [P] Implement `completeGoogleLink(db, idToken, { jwks, audience, linkingUserId })` in
      `src/server/auth/oidc/google.ts`: verifies the ID token (verify-id-token.ts) exactly like
      `completeGoogleSignIn`; on success, calls `linkOidcIdentity(db, GOOGLE_PROVIDER, claims.sub,
      linkingUserId)` — catches `isUniqueConstraintError` and returns a failure result rather than
      throwing; issues a session for `linkingUserId` (not a resolved existing/new user — the target
      is always the caller-supplied `linkingUserId`) and returns its cookie on success.

**Checkpoint**: Repository additions and the Google-linking completion function exist and
type-check.

---

## Phase 3: User Story 1 - A signed-in user links their email (P1) 🎯 MVP

**Goal**: Complete link-trigger → email → verify → identity-attached-to-existing-account
end-to-end, rejecting an already-linked identity cleanly (FR-005).

**Independent Test**: Per spec.md — with an authenticated session, link an email, then in a
separate unauthenticated attempt sign in via magic link with that email and confirm it resolves to
the original account.

- [X] T005 [US1] In `src/server/auth/magic-link.ts`, replace `sendMagicLinkEmail`'s
      `isNewAccount: boolean` param with `purpose: "new-account" | "sign-in" | "link"` (three email
      copy branches instead of two) — analyze finding M1: a linking email must not claim to be
      "finishing account creation" or a plain "sign-in link," since it's neither and may reach a
      recipient who needs to understand what they're being asked to confirm. Update `/request`'s
      existing call site to pass `"new-account"`/`"sign-in"` (unchanged behavior). Implement `POST
      /api/v1/auth/magic-link/link` in `src/server/routes/v1/auth/magic-link.ts`, behind
      `tenantContext` + `rateLimitBySession`: validates the email (400 on malformed input, matching
      `/request`), calls `invalidateAndCreateMagicLinkToken(db, email, c.get("tenant").userId)`,
      sends the email with `purpose: "link"`, returns `{ sent: true }` or `502` on send failure —
      contracts/api.md
- [X] T006 [US1] Modify `GET /api/v1/auth/magic-link/verify`: after consuming the token, if
      `linkingUserId` is present, call `linkMagicLinkIdentity(db, consumed.email,
      consumed.linkingUserId)` inside a try/catch — on `isUniqueConstraintError`, redirect to
      `/?magicLink=error` (FR-005); on success, `issueSession(db, consumed.linkingUserId)` and
      redirect to `/?magicLink=linked` (contracts/api.md's new outcome value). The existing
      no-`linkingUserId` path (normal sign-in) is unchanged.
- [X] T007 [US1] No route-mounting change needed — `/link` is added to the already-mounted
      `magicLinkAuth` Hono instance in `src/server/index.ts`; confirm `tenantContext` and
      `rateLimitBySession` are imported into `src/server/routes/v1/auth/magic-link.ts` (mirroring
      `_tenant-isolation-probe.ts`'s pattern)
- [X] T008 [P] [US1] Extend `tests/server/magic-link-auth.test.ts` (linking section): 1. An
      authenticated user links a new email, follows the link, and the resulting redirect is
      `/?magicLink=linked` with a session cookie for the *linking* user (not a new tenant). 2. A
      subsequent, separate, unauthenticated sign-in with that same email resolves to the same
      tenant as the linking user's. 3. Linking an email already linked to a *different* account is
      rejected (`/?magicLink=error`, no cookie, no change to the existing linkage) — seed the other
      account's link first via `linkMagicLinkIdentity` directly. 4. Linking an email already linked
      to the *same* account is rejected the same way (no special-casing "already yours"). 5. `POST
      /auth/magic-link/link` without a session cookie returns `401` before any token is created
      (FR-004).

**Checkpoint**: `deno task test` passes for the linking section; quickstart.md steps 1-4 work against
`deno task dev`.

---

## Phase 4: User Story 2 - A signed-in user links their Google account (P1)

**Goal**: Same guarantee as User Story 1, for Google — completed via `completeGoogleLink` (T004).

**Independent Test**: Per spec.md — with an authenticated session, link a Google account, then in a
separate unauthenticated attempt sign in with Google using that account and confirm it resolves to
the original account.

- [X] T009 [US2] Implement `GET /api/v1/auth/oidc/google/link` in
      `src/server/routes/v1/auth/oidc/google.ts`, behind `tenantContext` + `rateLimitBySession`:
      calls `createOidcState(db, c.get("tenant").userId)`, builds the authorization URL exactly
      like `/start`, redirects — contracts/api.md
- [X] T010 [US2] Modify `GET /api/v1/auth/oidc/google/callback`: after exchanging the code for
      tokens, if the consumed state's `linkingUserId` is present, call `completeGoogleLink` (T004)
      instead of `completeGoogleSignIn` — on failure (verification or `isUniqueConstraintError`
      surfaced through it), redirect to `/?oidc=error`; on success, set the cookie and redirect to
      `/?oidc=linked`. The existing no-`linkingUserId` path (normal sign-in) is unchanged.
- [X] T011 [US2] No route-mounting change needed — `/link` is added to the already-mounted
      `googleOidcAuth` Hono instance; confirm `tenantContext` and `rateLimitBySession` are imported
      into `src/server/routes/v1/auth/oidc/google.ts`
- [X] T012 [P] [US2] Extend `tests/server/oidc-auth.test.ts` (linking section): 1. An authenticated
      user links a Google identity (via `completeGoogleLink` directly with a fixture ID token,
      mirroring T012/T013's existing "call the core function directly, not via `SELF.fetch`"
      pattern from specs/004 — the code-exchange step is still deliberately untested) and the
      resulting session is for the linking user, not a new tenant. 2. Linking an identity already
      linked to a *different* account is rejected — seed the other account's link first via
      `linkOidcIdentity` directly. 3. Linking an identity already linked to the *same* account is
      rejected the same way. 4. `GET /auth/oidc/google/link` without a session cookie returns `401`
      before any state row is created (FR-004, via `SELF.fetch` since this doesn't touch the
      exchange step).

**Checkpoint**: `deno task test` passes for the linking section.

---

## Phase 5: Client UI

**Goal**: A way to trigger both linking flows from the already-authenticated view, matching the
existing "minimal, no design polish" precedent.

- [X] T013 [P] Modify `src/client/App.tsx`: in the `identity`-truthy branch, add an email input
      (reuse the existing `email` state) + "Link email" button calling `POST
      /api/v1/auth/magic-link/link`, and a "Link Google account" link (`<a href>`, plain navigation
      like the existing "Continue with Google") pointing to `/api/v1/auth/oidc/google/link`; extend
      `magicLinkOutcome`/`oidcOutcome` state to accept `"linked"` alongside `"ok"`/`"error"`, with a
      distinct banner string for each — new UI strings routed through
      `src/client/i18n/strings.ts` (constitution Principle IX)

## Phase 6: Polish & Cross-Cutting

- [X] T014 [P] Update `src/server/db/schema.sql` reference copy with the two new nullable
      `linking_user_id` columns
- [X] T015 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [X] T016 Walked through quickstart.md's magic-link half against `deno task dev` (curl, since the
      preview browser tool couldn't attach to a port here — another chat session held 5173):
      linked an email, followed the link (`/?magicLink=linked`, correct), confirmed the linked
      session resolves to the same tenant as the original, and confirmed re-linking the same email
      is rejected (`/?magicLink=error`, no cookie). The `linked` outcome banner wasn't
      pixel-verified in a browser this round — it's the same conditional-render pattern already
      visually confirmed for `ok`/`error` earlier this session, just a third union member, and
      typechecking passes. The Google half is unverified pending the real OAuth client from
      specs/004's quickstart.md (same external, owner-only dependency, not yet provisioned).

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: strict.
- **Phase 2 (Foundational)** → **all user story phases**: strict — repository additions and
  `completeGoogleLink` are shared by both stories.
- **User Story 1 (Phase 3)** and **User Story 2 (Phase 4)**: independent of each other — different
  files, no shared route logic beyond both reusing T003's repository additions.
- **Phase 5 (Client UI)** → after Phases 3-4 (needs both `/link` endpoints to exist).
- **Phase 6 (Polish)**: after all story phases.

## Parallel execution examples

Phase 3 and Phase 4 touch entirely different files (`magic-link.ts` vs. `oidc/google.ts` route and
test files) and have no dependency on each other beyond Phase 2:

```text
Phase 3: src/server/routes/v1/auth/magic-link.ts, tests/server/magic-link-auth.test.ts
Phase 4: src/server/routes/v1/auth/oidc/google.ts, tests/server/oidc-auth.test.ts
```

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** Magic-link's linking flow has no external
dependency beyond what specs/003 already established (no OAuth client needed), so it's provable
end-to-end — including a real email round trip — without waiting on anything. User Story 2 follows
the identical shape for Google and is safe to build right after; it's grouped at equal priority (P1)
in spec.md because both methods matter equally, not because one gates the other.
