# Phase 0 Research: Styled Transactional Email Template

No unresolved `NEEDS CLARIFICATION` markers remained after `/speckit-specify` — every open
question had a reasonable, constitution-aligned default (documented in spec.md's Assumptions).
This file records the smaller implementation-approach decisions made while turning that spec into
a plan.

## Decision: hand-written inline-styled HTML, no templating library

**Decision**: Build the shared chrome as a plain TypeScript function returning a template-literal
HTML string with inline `style=""` attributes and a `<table role="presentation">`-based layout,
matching the design source's own markup shape.

**Rationale**: Both existing email senders (`magic-link.ts`, `reminder-notification.ts`) already
hand-write their `html`/`text` strings directly — this is the established, zero-dependency pattern
in this codebase. Two call sites sharing one layout doesn't justify pulling in an
email-templating/MJML-style dependency; a plain function is simpler, has no new supply-chain
surface, and keeps the whole template auditable in one file.

**Alternatives considered**:
- An email-templating library (e.g., MJML compiled at build time) — rejected: adds a build step
  and a dependency for a two-call-site, single-layout need; Toolchain Discipline (Principle X)
  favors the simpler option absent a real justification.
- A React-based email renderer (e.g., `react-email`) — rejected for the same reason, plus it would
  be the first use of React outside `src/client/`, a much bigger footprint than this feature needs.

## Decision: request-details content limited to fields already available

**Decision**: The "request details" slot renders only rows the caller can supply without new
request-context plumbing: the target email address (`ACCOUNT`) and the app hostname the link
points at (`INSTANCE`, derived from the existing `requestUrl` parameter). Device and IP/location
rows from the design source are omitted.

**Rationale**: Constitution Principle IV (No Interpolated Data) and spec FR-007 both rule out
showing a fabricated or best-effort value. Populating a real IP/device row would require:
threading the actual `Request` object (or pre-extracted `CF-Connecting-IP` / `User-Agent`
values) through `sendMagicLinkEmail`'s two call sites (`/api/v1/auth/magic-link/request` and
`/link`), and, for anything beyond a raw IP/country, a User-Agent-parsing dependency this
codebase doesn't currently have. That's meaningfully more surface than "restyle the email" — out
of scope for this slice per the constitution's own slicing guidance (small enough for one
`/speckit-implement` PR). Tracked as a natural follow-up if wanted later, not blocking this one.

**Alternatives considered**:
- Thread `Request` through to the email layer now and show real IP/country (no device parsing) —
  rejected for this pass: real scope growth (touches both magic-link route handlers, not just the
  email module) for a "SHOULD" requirement the spec explicitly allows omitting.
- Show the design's exact mock values as placeholders — rejected outright, directly violates
  Principle IV.

## Decision: reminder-notification reuse scoped as best-effort (User Story 2)

**Decision**: Extract the shared chrome such that `reminder-notification.ts` can adopt it in the
same PR with reminder-specific content (item, vehicle, due/overdue status) in the content slot,
no request-details rows (nothing to show — no separate design reference exists for this email).

**Rationale**: Explicitly framed as "consider" in the original ask and as P2 in the spec — worth
doing since the chrome is being built anyway and the two functions already share a near-identical
try/catch/`env.EMAIL.send()` shape, but not gated on a design file that doesn't exist for it.
