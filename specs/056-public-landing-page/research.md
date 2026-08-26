# Phase 0 Research: Public Landing Page

## Decision 1: Reuse the real sign-in card instead of the design's demo-stats panel

**Decision**: The hero's right-hand column renders the actual sign-in form (extracted from
`AuthScreen` into a new `SignInCard`) instead of the design source's fabricated stats panel
('$3,121 spent', '11.9 L/100km', a fake 3-vehicle demo garage).

**Rationale**: Constitution Principle IV forbids presenting fabricated data as real. The design's
panel is explicitly illustrative marketing filler with no connection to anything real, and this
app has no concept of a "demo mode" to render truthfully instead. Putting the actual, working
sign-in form in that space is strictly more useful to a first-time visitor and sidesteps the
fabrication question entirely, while preserving the design's two-column hero layout.

**Alternatives considered**:
- Keep a fake stats panel but label it "example data" — rejected: still misleading at a glance,
  and adds a disclaimer the real product doesn't need.
- Keep the hero single-column (headline/lead/CTA only) and put the sign-in card below the fold —
  rejected: buries the one action every visitor needs to take, and diverges further from the
  design's approved two-column layout than necessary.

## Decision 2: "Documentation" links to the public GitHub README, not an in-app viewer

**Decision**: The header's and hero's documentation links point to
`https://github.com/iumalabs/odograph#readme` (opens in a new tab), not an in-app page.

**Rationale**: An in-app documentation/help viewer is tracked separately as issue #230
(`needs-spec`, not yet built). The repo is confirmed public (`gh repo view` → `visibility: PUBLIC`),
so the README is a real, already-working destination today. Linking to a page that doesn't exist
yet would violate the same "no fabrication" spirit that governs FR-007, just applied to a
navigation target instead of data.

**Alternatives considered**:
- Omit the documentation link entirely until #230 ships — rejected: the design and the issue both
  call for it, and a real destination already exists, so there's no reason to withhold it.
- Link to a new static in-repo docs page built as part of this feature — rejected: scope creep
  beyond issue #229's ask; #230 already owns "what does in-app documentation look like."

## Decision 3: Auth-model copy is rewritten wholesale, not just the one CTA button

**Decision**: Every piece of the design's copy that describes *how sign-in or hosting works* —
the "SELF-HOSTED" header badge, "Sign in with Cloudflare Access," the "Redirecting to Cloudflare
Access…" pending copy, and "sign-up and invites come later — a single owner for now" — is dropped
or rewritten, not just the one CTA label issue #229's own text already flagged.

**Rationale**: Reading `src/server/db/repository.ts`'s `createMagicLinkUser` (and the equivalent
passkey/Google registration paths) confirms every new sign-in already creates a fresh, fully
isolated tenant automatically, with no allowlist or invitation gate anywhere in the server code.
The design describes a single-owner, self-hosted-via-Docker, Cloudflare-Access-gated deployment —
none of which matches the real, already-live product. Carrying over only the one flagged CTA label
while leaving "a single owner for now" and a fake "SELF-HOSTED" badge in place would still actively
mislead a first-time visitor about how the product actually works.

**Alternatives considered**:
- Fix only the exact CTA string the issue quoted, leave the rest — rejected: the surrounding copy
  is just as inaccurate and a visitor reads the whole hero, not one button in isolation.

## Decision 4: No new routing; this replaces the existing `!identity` render branch

**Decision**: `LandingPage` becomes what `App.tsx` renders wherever `AuthScreen` renders today
(`if (!identity) return <AuthScreen .../>` → `return <LandingPage .../>`). No URL/path changes.

**Rationale**: Confirmed (grep) no `react-router` or equivalent dependency, and no
`window.location`/`history` usage in `App.tsx` — the whole SPA is state-driven, not route-driven.
Introducing routing for one page would be a much larger, unrelated architectural change.

**Alternatives considered**: none seriously considered — a router is out of scope for a single
page swap in an app that has never had one.
