# Tasks: Account Page

**Input**: Design documents from `/specs/058-account-page/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Unlike specs 055–057 (client-UI-only), this feature has real server-side logic (two new
routes). New server tests follow this project's normal `SELF.fetch` route-testing convention (e.g.
`tests/server/api-tokens.test.ts`), added incrementally per story into one shared file
(`tests/server/account-profile.test.ts`), same growing-one-file pattern spec 055's EMT-003/EMT-005
used. No client-component test suite exists (unchanged from prior specs) — client verification is
manual, per quickstart.md.

## Phase 1: Setup

None — no new dependency, no new top-level directory.

## Phase 2: Foundational

**Purpose**: The one query both new routes/both user stories need.

- [X] ACP-001 `src/server/db/repository.ts`: new `getAccountProfile(db, ctx: TenantContext,
      tokenHash: string)` — per data-model.md, returns `{ email, sessionExpiresAt, passkeyCount,
      hasGoogle, linkedEmails }` from `users`/`sessions`/`webauthn_credentials`/`oidc_identities`/
      `magic_link_identities`, filtered by `ctx.tenantId`/`ctx.userId` throughout (Constitution
      Principle I). Computed fresh on every call, nothing stored — same precedent as
      `computeVehicleAggregates`.

**Checkpoint**: Query type-checks and is unit-reachable; nothing wired to a route yet.

---

## Phase 3: User Story 1 - A user finds all their account controls in one place (Priority: P1) 🎯 MVP

**Goal**: A new account avatar/dropdown in the header and a dedicated Account page consolidating
profile, credentials (passkey/Google/email linking, moved from the Garage screen), API tokens and
account deletion (moved from Settings), and a real session summary.

**Independent Test**: Sign in, open the account dropdown, navigate to the Account page, and confirm
every relocated action still works and the Garage screen's old linking row is gone, per
quickstart.md scenarios 1–3.

### Implementation for User Story 1

- [X] ACP-002 [US1] `src/server/routes/v1/account.ts`: new `account.get("/", ...)` route calling
      `getAccountProfile`, returning `200 AccountProfile`. `tenantContext`-only (already applied at
      the router level) — never `tenantContextOrToken` (Constitution Principle VI/plan.md's
      Constitution Check: an API token must not read account profile data).
- [X] ACP-003 [US1] `src/client/account.ts`: add `getAccountProfile(): Promise<AccountProfile>`
      fetch wrapper alongside the existing `deleteAccount`, matching `vehicle-aggregates.ts`'s
      `jsonFetch` pattern.
- [X] ACP-004 [US1] New `tests/server/account-profile.test.ts`: `GET /api/v1/account` returns the
      real email/session-expiry/passkey-count/Google-flag/linked-emails for the calling session;
      401 with no session; a bearer API token (read or write scope) gets 401, not the profile
      (confirms the route stays cookie-only).
- [X] ACP-005 [US1] `src/client/i18n/strings.ts`: new keys — `accountNavLabel` ("Credentials"),
      `accountPageHeading` ("Account"), `accountSoleOwnerNote` ("Sole owner of this garage — no
      team members yet"), `accountSessionHeading` ("Session"), `accountSessionExpiresLabel`
      ("Session expires"), `accountCredentialsHeading` ("Credentials"), `accountMultiHeading`
      ("Multi-account"), `accountMultiNote` ("Invites and shared access are coming later — for now
      every account is its own private garage."), `accountSignUpSoon` ("Sign up · soon"),
      `accountInviteSoon` ("Invite · soon"), `accountMenuLabel` ("Account").
- [X] ACP-006 [US1] New `src/client/components/AccountView.tsx`: profile section (email,
      `accountSoleOwnerNote`); credentials section — the passkey/Google/email-linking controls
      moved verbatim from `App.tsx`'s Garage-screen row (same handlers, same props, just rendered
      here) plus a real `passkeyCount`/`hasGoogle`/`linkedEmails` summary from
      `getAccountProfile()`; the existing `<ApiTokens />` and `<AccountDeletion />` components,
      unchanged, rendered here instead of `SettingsView`; session section (`accountSessionExpiresLabel`
      + the real `sessionExpiresAt`); a disabled multi-account placeholder panel
      (`accountMultiHeading`/`accountMultiNote`, two `disabled` buttons using `accountSignUpSoon`/
      `accountInviteSoon` — FR-005, never a working action).
- [X] ACP-007 [US1] `src/client/components/AppShell.tsx`: accepts a new `accountProfile:
      AccountProfile | null` prop (fetched by `App.tsx` — see ACP-008 — `null` until loaded, same
      "may not have loaded yet" shape `vehicles`/other props already use); new account avatar/
      handle button in the header (initials derived from `accountProfile.email`, matching the
      existing currency-dropdown's `curOpen`/`toggleCur` pattern — a new `acctOpen` state) opening
      a dropdown with the real email, real `sessionExpiresAt`, a one-line real linked-methods
      summary, and three menu items: `accountMenuLabel` (→ `onSelectView("account")`),
      `landingDocsLink` (reuse, → `onSelectView("help")`), and a "Sign out" item (label added in
      ACP-014, US2 — this task wires the dropdown structure and the first two items only, leaving
      sign-out's actual handler for US2).
- [X] ACP-008 [US1] `src/client/App.tsx`: add `"account"` to `AppView` (already exported from
      `AppShell.tsx` — add the union member there too as part of this task); fetch
      `AccountProfile` once via `getAccountProfile()` (a `useEffect` keyed on `identity`, same
      shape as this file's other post-sign-in data fetches) and pass it to every `AppShell` call
      site as the new `accountProfile` prop; add a new `view === "account"` branch (same
      `AppShell`-wrapping pattern as every other view) rendering `<AccountView />`; remove the
      Garage-screen's inline passkey/Google/email-linking row (its handlers move to `AccountView`
      via props, not duplicated).
- [X] ACP-009 [US1] `src/client/components/SettingsView.tsx`: remove the `<ApiTokens />` and
      `<AccountDeletion />` renders and their now-unused imports/props — Settings keeps only
      currency and `<PushNotifications />`.
- [X] ACP-010 [US1] `src/client/design/responsive.css`: add a `className` hook + breakpoint rule
      for `AccountView`'s multi-column cards, same pattern as `.help-grid`/`.landing-hero`.

**Checkpoint**: User Story 1 fully functional — every account action lives on one page, reachable
from the header, with real data throughout.

---

## Phase 4: User Story 2 - The app finally has a way to sign out (Priority: P1)

**Goal**: A real, working sign-out action — this app's first production one.

**Independent Test**: Sign in, sign out, confirm a subsequent authenticated request with the old
cookie returns 401 — independent of the rest of the Account page, per quickstart.md scenario 4.

### Implementation for User Story 2

- [X] ACP-011 [US2] `src/server/routes/v1/account.ts`: new `account.post("/sign-out",
      rateLimitBySession, ...)` route — calls `invalidateSession(db, kv, cookieHeader)` (existing,
      unchanged function) and sets `Set-Cookie` to `serializeExpiredSessionCookie()` on success;
      `401 { error: "unauthorized" }` if the cookie doesn't resolve (mirrors the dev-only
      `/invalidate` route's exact contract, without its `notFoundOutsideDev` guard).
- [X] ACP-012 [US2] `src/client/account.ts`: add `signOut(): Promise<void>` fetch wrapper.
- [X] ACP-013 [US2] Extend `tests/server/account-profile.test.ts`: `POST /api/v1/account/sign-out`
      invalidates the session — a follow-up authenticated request with the same cookie gets 401;
      401 (not a crash) when called with no session already.
- [X] ACP-014 [US2] `src/client/components/AppShell.tsx` + `App.tsx`: finish the dropdown's "Sign
      out" menu item from ACP-007 — calls a new `handleSignOut` in `App.tsx` (calls `signOut()`,
      then `setIdentity(null)` so the app falls back to `LandingPage`, matching the existing
      `needsReauth` pattern).

**Checkpoint**: Both user stories independently functional. A user can sign out for the first time
in this app's history, from the account page this feature also built.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] ACP-015 Run `deno task check` (fmt, lint, typecheck, full suite, build) — all green.
- [X] ACP-016 Work through quickstart.md's manual validation steps 1–6 against a local
      `deno task dev` session in a real browser.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None.
- **Foundational (Phase 2)**: No dependencies. BLOCKS Phase 3 (the route needs the query) and,
  transitively, Phase 4 (the sign-out route lives in the same file/router).
- **User Story 1 (Phase 3)**: Depends on Phase 2 only.
- **User Story 2 (Phase 4)**: Depends on Phase 3's ACP-007 (the dropdown structure sign-out's menu
  item slots into) — independently *testable* at the route level (ACP-011/013 need nothing from
  US1), but the UI wiring (ACP-014) needs US1's dropdown to exist first, same relationship spec
  056/057's US2 had to their US1.
- **Polish (Phase 5)**: Depends on both user stories being complete.

### Parallel Opportunities

- ACP-004 (server tests) can be written alongside ACP-005–010 (client work) once ACP-002/003 exist
  — different files, no dependency.
- ACP-011/012/013 (US2's route + client wrapper + tests) are independent of ACP-014 (the UI wiring)
  until the final integration step.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (nothing to do) → Phase 2 (ACP-001) → Phase 3 (ACP-002 through ACP-010).
2. **STOP and VALIDATE**: quickstart.md scenarios 1–3, 5–6 against a local signed-in session.
3. This alone closes most of issue #231's ask (one consolidated Account page); User Story 2 adds
   the sign-out capability the design's dropdown also called for.

### Incremental Delivery

1. Phase 2 → the query exists, nothing user-visible changes yet.
2. Phase 3 → the Account page ships, consolidating everything (MVP).
3. Phase 4 → sign-out ships — a genuinely new capability, not just a relocation.
4. Phase 5 → full-suite check + manual sign-off.
