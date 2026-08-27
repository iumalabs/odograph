# Implementation Plan: Cloudflare OIDC Sign-In

**Branch**: `237-cloudflare-oidc-sign-in` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/061-cloudflare-oidc-signin/spec.md`

## Summary

Add Cloudflare as a second OIDC sign-in/link provider, alongside the existing Google one.
Concretely: the deploying operator configures a "Generic OIDC" application inside their own
Cloudflare Access (Zero Trust); Odograph consumes it as a standard OIDC relying party (research.md
Decisions 1-2). Since `google.ts`'s OIDC logic is already ~90% provider-agnostic, extract a shared
core (`oidc/client.ts`, generalized `verify-id-token.ts`) that both `google.ts` and a new
`cloudflare.ts` become thin config wrappers around (Decision 3) — the second concrete
instantiation is the right moment to generalize, not a premature one. `oidc_identities` and
`oidc_states` need zero schema changes; `oidc_identities` was explicitly designed for this
(Decision 9). The one real new UX wrinkle: the existing `oidcOkBanner`/etc. strings hardcode
"Google" — generalized to interpolate a `provider` name via the existing `{param}` templating
convention (Decision 5), translated into both English and Russian (spec 060 shipped both before
this feature started).

## Technical Context

**Language/Version**: TypeScript 5.9 (existing stack)

**Primary Dependencies**: `jose` (already used for Google's JWT verification/JWKS — reused as-is,
no new dependency), Hono (existing routing).

**Storage**: D1 — reuses the existing `oidc_identities` and `oidc_states` tables unchanged (no
migration; research.md Decision 9).

**Testing**: `vitest` (`deno task test`). New `tests/server/cloudflare-oidc-auth.test.ts`, closely
mirroring the existing `tests/server/oidc-auth.test.ts` structure, using the same (already
provider-agnostic) `oidc/fixture.ts` helpers.

**Target Platform**: Cloudflare Workers (`workerd`) — server-side routes; client-side is a plain
`<a href>` navigation (no JS ceremony), matching Google's existing sign-in link.

**Project Type**: Web application — existing `src/server` / `src/client` split, no new top-level
directory.

**Performance Goals**: N/A beyond parity with the existing Google flow (SC-001) — this is a
redirect-driven, network-bound external auth ceremony, not a latency-sensitive path.

**Constraints**: Must not function differently from Google's flow from a trust/security
perspective (FR-005/FR-006); must degrade gracefully with zero config present (FR-004, research.md
Decision 7); doesn't work on per-PR preview deploys, same as Google (research.md Decision 10).

**Scale/Scope**: 2 new server modules (`oidc/cloudflare.ts`, `routes/v1/auth/oidc/cloudflare.ts`)
plus 1 refactored pair (`oidc/client.ts` extracted from `google.ts`, `verify-id-token.ts`
generalized), 1 new dev-only fixture route, 3 new Workers secrets, ~6 new i18n keys (en + ru) plus
3 existing banner keys reworded to be provider-generic, 2 small UI additions
(`SignInCard.tsx`/`AccountView.tsx`, mirroring their existing Google anchors), 1 new client route
constants file addition, self-hosting docs update.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Tenant Isolation via Repository Layer)** — PASS. No new query path; reuses
  `oidc_identities`/`createOidcUser`/`linkOidcIdentity`/`findOidcIdentityByProviderAndSubject`,
  all already repository-layer, already tenant-safe.
- **Principle IV (No Interpolated Data)** — N/A/PASS. No aggregate computation involved; the one
  place this principle's *spirit* mattered was during spec/plan authoring itself — the actual
  Cloudflare Access mechanism was verified against Cloudflare's own docs rather than assumed (see
  spec.md's Research Finding, research.md Decisions 1-2).
- **Principle VI (Hardened API Tokens)** — N/A, unrelated surface.
- **Principle VII (Locked-Down Session and Transport Security)** — PASS. Session issuance reuses
  `issueSession` unchanged; rate limiting on `/start`/`/link` reuses `rateLimitByIp`/
  `rateLimitBySession` exactly as Google's routes do (FR-006).
- **Principle IX (Separated Language and Locale Axes; i18n from Screen One)** — PASS, and
  extended: every new string (button labels, banner text) routes through `t()`, with a real
  translation in both `en` and `ru` from the start (FR-007) — the first feature built since spec
  060 shipped the `ru` locale, so this is also the first real test that new features keep both
  languages in sync going forward.
- **Additional Constraints, D-003 (Auth v1: "...more providers addable later via configuration")**
  — PASS. This feature is precisely that: a second OIDC provider added via configuration
  (Workers secrets), reusing the identity-linking model D-003/D-004 already established.
- **Additional Constraints, D-004 (No email-based account auto-linking)** — PASS. Cloudflare
  identities resolve by `(provider, subject)` exactly like Google's, never by email; linking still
  requires an authenticated session and rejects (never merges) a Cloudflare identity already linked
  elsewhere (FR-002, mirroring `completeGoogleLink`'s existing behavior exactly).
- No other principle is implicated: no new R2/object storage, no new API token surface, no GDPR
  erasure change (an `oidc_identities` row for `provider = 'cloudflare'` is already covered by
  whatever erasure logic already deletes `provider = 'google'` rows, since both live in the same
  table with no provider-specific handling).

**Result**: PASS, no violations, no complexity trade-offs to justify.

## Project Structure

### Documentation (this feature)

```text
specs/061-cloudflare-oidc-signin/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/
│   └── api.md             # Phase 1 output — mirrors specs/004's contract shape
└── tasks.md               # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/server/auth/oidc/
├── client.ts              # NEW — generic core extracted from google.ts (research.md Decision 3):
│                           #   buildAuthorizationUrl, exchangeCodeForTokens, completeSignIn,
│                           #   completeLink, parameterized by an OidcProviderConfig
├── google.ts               # MODIFIED — becomes a thin config + re-export over client.ts
├── cloudflare.ts            # NEW — thin config + re-export over client.ts, endpoints templated
│                           #   from CLOUDFLARE_ACCESS_TEAM_DOMAIN + CLOUDFLARE_ACCESS_CLIENT_ID
├── verify-id-token.ts        # MODIFIED — verifyGoogleIdToken generalized to
│                           #   verifyOidcIdToken(idToken, {jwks, audience, issuers})
└── fixture.ts                # UNCHANGED — already provider-agnostic (issuer/audience overrides)

src/server/auth/
├── dev-oidc.ts                # UNCHANGED
└── dev-cloudflare-oidc.ts      # NEW — mirrors dev-oidc.ts, mounted at /api/v1/_dev/oidc-cloudflare

src/server/routes/v1/auth/oidc/
├── google.ts                   # MODIFIED — calls into the now-shared client.ts functions
└── cloudflare.ts                # NEW — /start, /link, /callback, mirroring google.ts's routes

src/server/types.ts               # MODIFIED — add CloudflareOidcSecrets (mirrors GoogleOidcSecrets)
src/server/index.ts                # MODIFIED — mount the two new routes
  (routes/v1/auth/oidc/cloudflare.ts at /api/v1/auth/oidc/cloudflare,
   dev-cloudflare-oidc.ts at /api/v1/_dev/oidc-cloudflare, dev-only per notFoundOutsideDev)

src/client/auth/oidc.ts             # MODIFIED — add CLOUDFLARE_SIGN_IN_URL/CLOUDFLARE_LINK_URL
src/client/App.tsx                   # MODIFIED — parse the new `provider` query param alongside
  the existing `oidc` one; pass Cloudflare URLs/props through to SignInCard/AccountView
src/client/components/SignInCard.tsx  # MODIFIED — add a "Continue with Cloudflare" anchor,
  mirroring the existing Google one
src/client/components/AccountView.tsx  # MODIFIED — add a "Link Cloudflare account" anchor,
  mirroring the existing Google one
src/client/i18n/strings.ts              # MODIFIED — new keys (en + ru): continueWithCloudflare,
  linkCloudflareAccount, cloudflareLinkedBanner; reword oidcOkBanner/oidcErrorBanner/
  oidcLinkedBanner to interpolate {provider} instead of hardcoding "Google" (both locales)

tests/server/
├── oidc-auth.test.ts                  # UNCHANGED
└── cloudflare-oidc-auth.test.ts        # NEW — mirrors oidc-auth.test.ts's structure

docs/self-hosting.md                    # MODIFIED — new optional step documenting Cloudflare
  Access configuration, mirroring the existing Google step's "optional, degrades gracefully" framing
```

**Structure Decision**: Existing single-Worker + SPA layout (`src/client` / `src/server`), no new
top-level directory. The only genuinely new architectural piece is the `oidc/client.ts` extraction
— everything else (route file, dev fixture route, UI anchors, i18n keys, test file) is a direct,
file-for-file mirror of an existing, working precedent for the same shape of thing.

## Complexity Tracking

No unjustified violations. The one piece of this plan that isn't a pure 1:1 mirror of existing
code — extracting `oidc/client.ts` — is deliberately justified in research.md Decision 3 as the
correct, non-premature moment to generalize (second concrete provider, not the first), not a
complexity trade-off requiring a simpler-alternative-rejected table entry.
