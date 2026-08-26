# Feature Specification: Public Landing Page

**Feature Branch**: `056-public-landing-page`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "New: public landing page for unauthenticated visitors. The updated design (Claude Design project dfecc39c-323d-4b89-a9ec-c126b3aa2deb, file 'Кокпит - прототип.dc.html', 'landing' state) adds a public marketing/landing page for unauthenticated visitors, replacing the bare compact AuthScreen sign-in form they see today. Header: logo, Documentation link, Sign in button. Hero: kicker, 3-line H1, lead paragraph, primary CTA, secondary 'read the documentation' link, plus a demo stats/features panel. The design's own copy for the primary CTA says 'Sign in with Cloudflare Access' and implies a 'Redirecting to Cloudflare Access...' modal — this does not match the real app, which has three real, already-implemented auth methods (passkey, magic-link, Google OIDC) and no Cloudflare Access anywhere. The CTA copy and sign-in flow must be adapted to actually open the real sign-in options. Tracked as GitHub issue #229 on iumalabs/odograph."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An unauthenticated visitor understands the product and can sign in (Priority: P1)

Someone who has never used odograph (or whose session just expired) opens the app and, instead of a bare, unlabeled sign-in form, sees a real landing page that explains what odograph is and lets them immediately choose one of the app's actual sign-in methods — passkey, magic link, or Google.

**Why this priority**: This is the entire scope of issue #229 and the only thing every unauthenticated visitor sees before they can use the app at all.

**Independent Test**: Load the app with no session cookie present and confirm the hero content (headline, lead copy) renders, and that all three existing sign-in actions (passkey sign-up, passkey sign-in, magic-link request, Google OIDC) still work exactly as they do today via the current `AuthScreen`.

**Acceptance Scenarios**:

1. **Given** a visitor with no active session, **When** they load the app, **Then** they see a hero section with a headline and lead paragraph describing odograph, not only a bare email/passkey form.
2. **Given** that same visitor, **When** they look at the sign-in options, **Then** they see passkey sign-up, passkey sign-in, magic-link, and Google sign-in — the same four real actions `AuthScreen` offers today — with no button or copy implying a Cloudflare Access redirect.
3. **Given** a previously-signed-in user whose session has expired, **When** the app detects this (`needsReauth`), **Then** they see the same landing page a first-time visitor sees — no separate sign-out screen is introduced.
4. **Given** any of the existing pending/outcome states (WebAuthn prompt in flight, magic-link sent, an OIDC error), **When** that state is active, **Then** the landing page shows the same banners and disabled-button behavior `AuthScreen` shows today — no regression.
5. **Given** a narrow (mobile) viewport, **When** the landing page renders, **Then** the hero's multi-column layout stacks to a single column and remains fully usable.

---

### User Story 2 - A visitor can read documentation before signing in (Priority: P2)

Someone who wants to understand odograph in more depth before creating an account can reach real product documentation from the landing page, without signing in first.

**Why this priority**: Called out in the design as a secondary CTA next to the primary sign-in action; not required for the page to be useful, but low-effort once a real destination exists.

**Independent Test**: Click the "Documentation" link/button and confirm it opens a real, already-public destination — independent of whether User Story 1's sign-in flow is exercised at all.

**Acceptance Scenarios**:

1. **Given** the landing page, **When** a visitor clicks "Documentation" (header or hero secondary link), **Then** it opens the project's real public GitHub README in a new tab — not a broken link or a page that doesn't exist yet.

---

### Edge Cases

- What happens for a session-expired user (not just a brand-new visitor)? They see the exact same landing page — there is no way for the landing page to distinguish "never signed in" from "session just expired," and today's `AuthScreen` already doesn't distinguish these either (FR-011 of an earlier spec already established this reuse).
- What happens on a narrow/mobile viewport? The hero's two-column layout (copy + sign-in card) stacks vertically, following the same responsive breakpoint convention already used elsewhere in the app (`src/client/design/responsive.css`), not a new one invented for this page.
- What happens to the sign-in card's existing pending/error/banner states? They render exactly as `AuthScreen` renders them today — this feature restyles and repositions that card, it does not change its behavior.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Unauthenticated visitors (including a visitor whose session just expired) MUST see a landing page presenting odograph's real value proposition (a headline and lead copy describing the product) instead of only a bare sign-in form.
- **FR-002**: The landing page MUST NOT reference any authentication mechanism the app doesn't actually have — no "Cloudflare Access," no JWT-header-trust language, no simulated "redirecting..." modal. All sign-in copy MUST describe the app's three real methods: passkey, magic link, and Google.
- **FR-003**: The landing page MUST NOT describe odograph as self-hosted, single-owner, or requiring manual deployment (e.g. Docker) — the real, already-deployed product is a hosted service where any visitor can sign up and immediately receives their own isolated account, today, not "later."
- **FR-004**: All four of `AuthScreen`'s existing sign-in actions (passkey sign-up, passkey sign-in, send magic link, continue with Google) and their existing pending/outcome/error/banner states MUST remain fully present and functional on the landing page — no behavioral regression versus today.
- **FR-005**: The landing page MUST include a documentation link. Since no in-app documentation viewer exists yet (tracked separately as issue #230), this link MUST point to the project's real, already-public GitHub README rather than a page that doesn't exist.
- **FR-006**: The landing page MUST remain usable at narrow (mobile) viewport widths — its multi-column hero layout MUST stack to a single column rather than overflow or become unreadable, using the app's existing responsive breakpoint convention.
- **FR-007**: The landing page MUST NOT display fabricated or placeholder usage statistics (e.g., invented spend totals or vehicle counts) as though they were real data (Constitution Principle IV — no interpolated data).
- **FR-008**: The landing page's copy MUST be English-only, matching the app's currently locked v1-English-only scope; it MUST NOT add a language toggle (tracked separately as issue #233).

### Key Entities

This feature has no new data entities — it is a client-side UI change with no new persisted data, no new API surface, and no new routes (the app has no client-side router; this replaces the existing `!identity` render branch in `App.tsx`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor can identify what odograph does within the first few seconds of the page loading, without needing to sign in first.
- **SC-002**: All three real sign-in methods (passkey, magic link, Google) remain reachable and functional from the landing page, with zero regression in their existing behavior versus today's `AuthScreen`.
- **SC-003**: A visitor who wants to read documentation before creating an account can do so without signing in, and lands on a real, working page.

## Assumptions

- **Design source fidelity, with a deliberate, larger departure than issue #229 itself already called out.** `Кокпит - прототип.dc.html`'s `landing` state (Claude Design project `dfecc39c-323d-4b89-a9ec-c126b3aa2deb`) is followed for layout structure only — header, two-column hero, kicker/H1/lead, notes. Its bundled copy describes a fundamentally different product than the one that's actually deployed: a single-owner instance, self-hosted via Docker, gated by Cloudflare Access, with "sign-up and invites com[ing] later." Reading the real implementation (`src/server/db/repository.ts`'s `createMagicLinkUser`, and the passkey/Google registration paths) confirms the opposite: odograph is already a live, open-signup, multi-tenant hosted service — any visitor can sign in today via passkey, magic link, or Google and immediately gets their own fully isolated account (tenant), with no allowlist or invitation gate anywhere in the code. Every piece of the design's copy that describes *how sign-in or hosting works* — not just the one CTA button issue #229 flagged — is rewritten to match the real product.
- **The design's demo/illustrative stats panel is not carried over.** Its numbers ('$3,121 spent', '11.9 L/100km', a fake 3-vehicle garage) are fabricated placeholder data with no connection to anything real; Constitution Principle IV disallows presenting invented figures as though genuine. That panel's space in the hero is used for the real, functional sign-in card instead (the content of today's `AuthScreen`, restyled to sit in the hero rather than centered full-page) — more useful to a first-time visitor than illustrative numbers, and removes the ambiguity entirely rather than requiring a "this is a demo" disclaimer.
- **"Documentation" links to the project's public GitHub README**, not an in-app viewer — issue #230 (in-app Documentation/Help viewer) doesn't exist yet and is out of scope here. The design's separate in-shell "guest access · documentation only" header pattern (browsing docs without signing in, from *inside* the app shell) depends on #230 existing and is explicitly out of scope for this feature too.
- **No new routing.** This app has no client-side router (confirmed: no `react-router` or equivalent dependency, no `window.location`/history usage in `App.tsx`). The landing page is a straightforward replacement of the existing `!identity` branch in `App.tsx`'s render, matching how the rest of the SPA already works — not a new URL/path.
- **English-only copy**, matching the app's locked v1-English-only scope (Constitution Principle IX/XI); the design's RU/EN toggle is separate, not-yet-built work (issue #233).
