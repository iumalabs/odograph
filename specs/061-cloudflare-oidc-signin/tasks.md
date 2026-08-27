# Tasks: Cloudflare OIDC Sign-In

**Input**: Design documents from `/specs/061-cloudflare-oidc-signin/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Included — this feature touches auth/session issuance (security-sensitive, Principle
VII), and a directly-testable fixture-based pattern already exists to mirror
(`tests/server/oidc-auth.test.ts`).

## Phase 1: Setup

None — no new dependency, no new top-level directory (plan.md Project Structure).

## Phase 2: Foundational

**Purpose**: The shared OIDC core and provider-generic outcome plumbing both user stories need.
Blocking — neither story can be implemented without this, and both existing Google routes/tests
must keep passing unchanged throughout.

- [X] CFO-001 `src/server/auth/oidc/verify-id-token.ts`: generalize `verifyGoogleIdToken` into
      `verifyOidcIdToken(idToken, { jwks, audience, issuers }: { jwks: JWTVerifyGetKey; audience:
      string; issuers: string[] })` — same body, `issuer: GOOGLE_ISSUERS` replaced by the new
      `issuers` parameter. Keep exporting `GOOGLE_ISSUERS` (now just a constant consumed by
      `google.ts`'s config, not baked into the verify function itself).
- [X] CFO-002 New `src/server/auth/oidc/client.ts`: extract the generic core from `google.ts`
      (research.md Decision 3) — `type OidcProviderConfig = { provider: string;
      authorizationEndpoint: string; tokenEndpoint: string; issuers: string[]; scope: string }`,
      and provider-parameterized `buildAuthorizationUrl(config, input)`,
      `exchangeCodeForTokens(config, input)`, `completeSignIn(db, config, jwks, idToken, {
      audience })`, `completeLink(db, config, jwks, idToken, { audience, linkingUserId })` — same
      logic `google.ts` has today (PKCE challenge computation, token exchange, `(provider,
      subject)` resolution via `findOidcIdentityByProviderAndSubject`/`createOidcUser`/
      `linkOidcIdentity`), now taking `config.provider`/`config.authorizationEndpoint`/etc. instead
      of Google-specific constants, and calling `verifyOidcIdToken` (CFO-001) with
      `config.issuers`.
- [X] CFO-003 `src/server/auth/oidc/google.ts`: reduce to a thin config + re-export —
      `GOOGLE_CONFIG: OidcProviderConfig = { provider: "google", authorizationEndpoint:
      GOOGLE_AUTHORIZATION_ENDPOINT, tokenEndpoint: GOOGLE_TOKEN_ENDPOINT, issuers: GOOGLE_ISSUERS,
      scope: "openid email profile" }`, with `buildGoogleAuthorizationUrl`/
      `exchangeCodeForTokens`/`completeGoogleSignIn`/`completeGoogleLink` becoming thin wrappers
      calling into `client.ts`'s generic functions with `GOOGLE_CONFIG`. Run
      `tests/server/oidc-auth.test.ts` and confirm it still passes unchanged — this is the
      regression check that the extraction preserved Google's exact existing behavior.
- [X] CFO-004 `src/client/i18n/strings.ts`: reword the three existing OIDC banner keys to
      interpolate a provider name instead of hardcoding "Google" (research.md Decision 5) —
      `oidcOkBanner: "Signed in with {provider}."`, `oidcErrorBanner: "{provider} sign-in didn't
      complete. Please try again."`, `oidcLinkedBanner: "{provider} account linked."` — in both
      `en` and `ru`. Add `oidcProviderGoogle: "Google"` and `oidcProviderCloudflare: "Cloudflare"`
      keys (both locales) as the actual `{provider}` values passed at call sites — provider brand
      names stay unchanged across languages, but still route through `t()` per FR-007 rather than
      being a hardcoded literal at the interpolation call site.
- [X] CFO-005 `src/server/routes/v1/auth/oidc/google.ts`: add `&provider=google` to the three
      existing redirect targets (`/app?oidc=ok`, `/app?oidc=linked`, `/?oidc=error`).
- [X] CFO-006 `src/client/App.tsx`: alongside the existing `oidc` query-param parse, read the new
      `provider` param into a small piece of state (or fold into the existing `OidcOutcome`
      shape as `{ status: "ok" | "error" | "linked"; provider: "google" | "cloudflare" } | null`);
      pass the resolved provider display name (via `t("oidcProviderGoogle")`/
      `t("oidcProviderCloudflare")`) as the `{provider}` param to `t("oidcOkBanner", {...})`/etc.
      wherever those banners currently render.
- [X] CFO-007 Run `tests/server/oidc-auth.test.ts` again plus `deno task typecheck` — confirms
      CFO-004–006 didn't regress the existing Google flow's redirect/banner behavior.

**Checkpoint**: Shared OIDC core exists and is proven equivalent to the pre-refactor Google
behavior; outcome banners are provider-generic. Nothing Cloudflare-specific exists yet.

---

## Phase 3: User Story 1 - Sign up or sign in with an authorized Cloudflare identity (Priority: P1) 🎯 MVP

**Goal**: "Continue with Cloudflare" on the landing page creates a new account on first use, and
returns to the same account on repeat use — full parity with the existing Google flow.

**Independent Test**: quickstart.md steps 2-3 (fixture-based, no real Cloudflare config needed) and
step 4 (real Cloudflare Access, if configured).

### Tests for User Story 1

- [X] CFO-008 [P] [US1] New `tests/server/cloudflare-oidc-auth.test.ts`, mirroring
      `oidc-auth.test.ts`'s full case list one-for-one (SC-002 requires complete parity, not a
      subset) — using `oidc/fixture.ts`'s existing `issuer`/`audience` overrides
      (`issuer: "https://test-team.cloudflareaccess.com"`, a Cloudflare-shaped `audience`) instead
      of Google's defaults:
      1. a fixture ID token for a subject never seen before creates exactly one tenant/user/
         identity and returns a working session;
      2. a second call with the same subject resolves to the same tenant, not a new one;
      3. a callback with a state value never issued by `/start` redirects to
         `/?oidc=error&provider=cloudflare` with no cookie;
      4. a callback carrying `?error=access_denied` redirects to `/?oidc=error&provider=cloudflare`
         before any state lookup;
      5. a fixture ID token that fails verification (wrong audience) is rejected with no session
         issued;
      6. a fixture ID token that fails verification (expired) is rejected with no session issued;
      7. a fixture ID token with `email_verified: false` still resolves/creates an account like any
         other;
      8. a Cloudflare sign-in for an email already used by a passkey (or Google) account creates
         its own distinct account (D-004) — this is the cross-provider isolation case.

### Implementation for User Story 1

- [X] CFO-009 [US1] New `src/server/auth/oidc/cloudflare.ts`: `CLOUDFLARE_CONFIG` built from
      `CLOUDFLARE_ACCESS_TEAM_DOMAIN`/`CLOUDFLARE_ACCESS_CLIENT_ID` (research.md Decision 2's URL
      templates — `https://<team-domain>.cloudflareaccess.com/cdn-cgi/access/sso/oidc/<client-id>/
      {authorization,token,jwks}`, issuer `https://<team-domain>.cloudflareaccess.com`), plus
      `getCloudflareJwks()` (mirrors `getGoogleJwks()`'s per-isolate `createRemoteJWKSet` caching)
      and re-exported `buildCloudflareAuthorizationUrl`/`completeCloudflareSignIn`/
      `completeCloudflareLink` wrappers over `client.ts`, matching `google.ts`'s post-CFO-003
      shape exactly.
- [X] CFO-010 `src/server/types.ts`: add `CloudflareOidcSecrets = { CLOUDFLARE_ACCESS_TEAM_DOMAIN:
      string; CLOUDFLARE_ACCESS_CLIENT_ID: string; CLOUDFLARE_ACCESS_CLIENT_SECRET: string }`,
      included in `AppEnv["Bindings"]` alongside `GoogleOidcSecrets` (research.md Decision 6).
- [X] CFO-011 [US1] New `src/server/routes/v1/auth/oidc/cloudflare.ts`: `/start` (rate-limited via
      `rateLimitByIp`, builds the authorization URL, redirects) and `/callback` (consumes state,
      exchanges code, verifies token, completes sign-in, redirects to
      `/app?oidc=ok&provider=cloudflare` or `/?oidc=error&provider=cloudflare`) — mirrors
      `routes/v1/auth/oidc/google.ts`'s post-CFO-005 shape. `/link` is added in Phase 4 (CFO-016),
      not here.
- [X] CFO-012 New `src/server/auth/dev-cloudflare-oidc.ts`: mirrors `dev-oidc.ts` exactly —
      `GET /`, gated by `notFoundOutsideDev`, signs a fixture ID token (`sub:
      "dev-fixture:${email}"`, deterministic per email) and drives `completeCloudflareSignIn` with
      the local fixture JWKS, redirecting to `/?oidc=ok&provider=cloudflare` on success.
- [X] CFO-013 `src/server/index.ts`: mount `routes/v1/auth/oidc/cloudflare.ts` at
      `/api/v1/auth/oidc/cloudflare` and `dev-cloudflare-oidc.ts` at
      `/api/v1/_dev/oidc-cloudflare`, alongside the existing Google/dev-oidc mounts.
- [X] CFO-014 [US1] `src/client/auth/oidc.ts`: add `CLOUDFLARE_SIGN_IN_URL =
      "/api/v1/auth/oidc/cloudflare/start"` (the `CLOUDFLARE_LINK_URL` counterpart is added in
      Phase 4).
- [X] CFO-015 [US1] `src/client/components/SignInCard.tsx`: add a `cloudflareSignInUrl: string`
      prop and a second `<a>` anchor next to the existing Google one, labeled
      `t("continueWithCloudflare")` (new key, en+ru). `src/client/App.tsx`: thread
      `CLOUDFLARE_SIGN_IN_URL` through as that prop.

**Checkpoint**: User Story 1 fully functional — a visitor can sign up/sign in via Cloudflare, with
correct provider-labeled banners, independently of Phase 4.

---

## Phase 4: User Story 2 - Link a Cloudflare identity to an existing account (Priority: P2)

**Goal**: An already-signed-in user can add Cloudflare as an additional way to reach their
existing account, matching the existing Google-linking capability exactly, including rejecting a
Cloudflare identity already linked elsewhere.

**Independent Test**: quickstart.md step 3's linking variant and step 4's real-Cloudflare
equivalent.

### Tests for User Story 2

- [X] CFO-016 [P] [US2] Extend `tests/server/cloudflare-oidc-auth.test.ts` (CFO-008) with the
      remaining cases `oidc-auth.test.ts` has for linking, so the two files stay in full parity:
      9. an authenticated user links a Cloudflare identity, and the resulting session is for the
         linking user, not a new tenant;
      10. rejects linking an identity already linked to a *different* account;
      11. rejects linking an identity already linked to the caller's *own* account, same as any
          other;
      12. refuses `/link` without a session, before any state row is created.

### Implementation for User Story 2

- [X] CFO-017 [US2] `src/server/routes/v1/auth/oidc/cloudflare.ts`: add `/link`
      (`tenantContext`, `rateLimitBySession`, requires an authenticated session — no
      unauthenticated variant), mirroring `google.ts`'s `/link` route exactly, redirecting to
      `/app?oidc=linked&provider=cloudflare` on success.
- [X] CFO-018 [US2] `src/client/auth/oidc.ts`: add `CLOUDFLARE_LINK_URL =
      "/api/v1/auth/oidc/cloudflare/link"`.
- [X] CFO-019 [US2] `src/client/components/AccountView.tsx`: add a `cloudflareLinkUrl: string`
      prop and a "Link Cloudflare account" anchor next to the existing Google one, labeled
      `t("linkCloudflareAccount")` (new key, en+ru). `src/client/App.tsx`: thread
      `CLOUDFLARE_LINK_URL` through as that prop.

**Checkpoint**: Both user stories fully functional — Cloudflare is a complete fourth sign-in
method, on par with Google in every respect FR-001 through FR-007 require.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] CFO-020 `specs/061-cloudflare-oidc-signin/contracts/api.md`'s cross-cutting note about
      `CLOUDFLARE_ACCESS_TEAM_DOMAIN`/etc. being required: add the matching new step to
      `docs/self-hosting.md` (a new numbered step alongside the existing Google one, same
      "optional, degrades to a broken external redirect rather than breaking the app" framing).
- [X] CFO-021 Run `deno task check` (fmt, lint, typecheck, full test suite, build) — all green.
- [X] CFO-022 Work through quickstart.md's manual validation steps 2-3 (fixture-based, no real
      Cloudflare config needed) against a local `deno task dev` session in a real browser. Step 1
      (real Cloudflare Access setup) and step 4 (real end-to-end) are deployment-time/operator
      actions outside this task list's own scope — noted, not blocked on.

**Checkpoint**: Feature complete and fully verified for everything within this codebase's control;
the real-Cloudflare-Access smoke test remains an operator action for whenever iumalabs configures
one.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None.
- **Foundational (Phase 2)**: CFO-001 → CFO-002 → CFO-003 → CFO-007, strictly sequential (each
  depends on the previous file existing/compiling); CFO-004/CFO-005/CFO-006 can proceed in
  parallel with each other once CFO-003 lands, but CFO-007's regression check needs all of
  CFO-001–006 done first. BLOCKS Phase 3 and Phase 4 — neither can call into `client.ts` or emit a
  `provider`-aware redirect before this phase completes.
- **User Story 1 (Phase 3)**: Depends on Phase 2. CFO-009 → CFO-011 → CFO-012 → CFO-013 are
  sequential (each builds on the previous file); CFO-010 (types.ts) and CFO-014/CFO-015 (client
  files) are independent of that chain and of each other, genuinely parallelizable.
- **User Story 2 (Phase 4)**: Depends on Phase 3's CFO-011 (extends the same route file) and
  CFO-009 (needs `completeCloudflareLink`, already exported from Phase 3). Not otherwise dependent
  on Phase 3's UI tasks (CFO-014/015) — could be implemented in parallel with those specifically,
  though sequenced after in this list for readability.
- **Polish (Phase 5)**: Depends on both user stories being complete.

### Parallel Opportunities

- CFO-004, CFO-005, CFO-006 (Phase 2, once CFO-003 lands) — different files.
- CFO-010, CFO-014, CFO-015 (Phase 3) — different files, no dependency on each other.
- CFO-008 (US1 test) can be drafted in parallel with CFO-009–015's implementation, following this
  project's usual pattern of tests validating behavior once the implementation exists, not
  strict TDD-before-code (matches `oidc-auth.test.ts`'s own precedent — implementation and test
  were written together, not test-first).

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (nothing to do) → Phase 2 (CFO-001–007) → Phase 3 (CFO-008–015).
2. **STOP and VALIDATE**: quickstart.md steps 2-3.
3. This alone delivers the issue's core ask — a working fourth sign-in method. User Story 2
   (linking) is a smaller, independent extension of the same mechanism.

### Incremental Delivery

1. Phase 2 → shared OIDC core exists, Google's own behavior provably unchanged, nothing
   Cloudflare-specific yet.
2. Phase 3 → sign-up/sign-in via Cloudflare works end-to-end (fixture-verified; real-Cloudflare
   pending operator setup).
3. Phase 4 → account linking works too.
4. Phase 5 → docs + final full-suite sign-off.
