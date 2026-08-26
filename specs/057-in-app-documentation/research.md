# Phase 0 Research: In-App Documentation Viewer

## Decision 1: Content model is a static, centrally-organized TS module

**Decision**: `src/client/docs-content.ts` exports `en: DocSection[]` (see data-model.md), mirroring
`strings.ts`'s `{ en: {...} }` shape. No CMS, no server route, no new dependency.

**Rationale**: The content changes at code-review cadence, not runtime — a plain module fits the
project's simplicity bias (no dependency is justified for six static sections) and matches the
existing precedent of `strings.ts` as the one place all UI copy lives. See plan.md's Constitution
Check for how this still satisfies Principle IX's actual intent despite not being individual `t()`
keys per sentence.

**Alternatives considered**:
- Fetch content from `docs/*.md` at build time (e.g. a Vite plugin parsing Markdown) — rejected:
  real complexity (a Markdown-to-block-model parser, code-fence handling) for content that changes
  rarely and is already small enough to hand-author directly in the target shape.
- A server-side route serving doc JSON — rejected: adds a network round-trip and a route for
  content that has no reason to be dynamic; would also need its own caching story for no benefit.

## Decision 2: Six sections, chosen for accuracy over parity with the design's seven

**Decision**: Getting started · Signing in · Fuel & consumption · Service & reminders · API access
· Self-hosting. Each fact below is the real code path backing that section's content:

| Section | Real behavior it documents | Source |
|---|---|---|
| Getting started | Real feature list: vehicles/garage, fuel, service log, photos, reminders, planner, documents | `AppShell.tsx` `NAV_ITEMS`, existing screens |
| Signing in | Passkey (primary), magic link (15 min, single-use), Google OIDC; account deletion | `src/client/components/SignInCard.tsx`; `src/server/auth/magic-link.ts`; `src/server/routes/v1/account.ts`'s `account.delete("/")` |
| Fuel & consumption | Fuel economy = odometer delta between consecutive fill-ups (sorted by odometer reading), no full-tank restriction; unit (km/mi) and currency toggles | `src/server/db/repository.ts`'s `listFuelRecordsWithEconomy`/`computeVehicleAggregates` |
| Service & reminders | A reminder fires by distance and date, whichever comes first; marking it done creates a service-log entry; the planner's kanban does the same once a card reaches "done" | `src/server/*reminder*` (spec 024/053 lineage), `handleMarkReminderDone`/`handleAdvancePlanCard` in `App.tsx` |
| API access | Create a scoped (`read`/`write`) token, authenticate with `Authorization: Bearer <token>` | `src/server/routes/v1/tokens.ts`; `src/server/middleware/tenant-context.ts`'s Bearer-token acceptance |
| Self-hosting | `wrangler`-based deploy to your own Cloudflare account (D1/KV/R2), no Docker image, optional Google OAuth, Email Routing required for magic-link/reminder mail | `docs/self-hosting.md` (condensed, links out to the full guide) |

**Rationale**: The design's 7th section ("Гараж и документы" — gallery/documents mechanics) and its
"Аккаунт и данные" section don't have enough *distinct, real mechanism* beyond what's already
covered — gallery/documents are already implied by "Getting started" 's feature list, and the one
real fact from "account/data" (deletion) fits naturally under "Signing in" rather than justifying a
7th section built mostly around the design's fictional multi-account/invite content.

**Alternatives considered**:
- Match the design's exact 7 sections 1:1, substituting real content for the 2 fictional ones —
  rejected: would require inventing enough *distinct* real content for "Гараж и документы" and
  "Аккаунт" to fill a whole section each, which risks padding with restated feature-list bullets
  rather than genuinely new mechanism, whereas folding them keeps every section substantive.

## Decision 3: Reachable-without-session via `LandingPage`'s own local state, not a new "guest shell" mode

**Decision**: `LandingPage`'s "Documentation" link toggles local component state to render
`<HelpView />` in place of the hero — inside `LandingPage`'s own existing header (which already has
logo, theme toggle, and a "Sign in" button) — rather than introducing a signed-out/"guest" variant
of `AppShell`'s nav-rail chrome.

**Rationale**: Spec 056 explicitly deferred the design's in-shell "guest access · documentation
only" header pattern (nav rail + lightened header) as out of scope, pending this feature's
existence. Building that whole second chrome variant now would be a second, larger UI surface for
the same content `HelpView` already renders — `LandingPage` reusing `HelpView` directly, inside
chrome it already has, is the minimal change that satisfies FR-006 without reopening that deferral.

**Alternatives considered**:
- Build the design's guest-mode `AppShell` variant (nav rail + "guest access · documentation only"
  header) — rejected: real scope creep beyond issue #230's ask; a second nav-rail variant purely to
  host one link's destination.
- A separate standalone `/help`-shaped page — rejected: this app has no client-side router (spec
  056 research.md Decision 4 already established this); introducing one for a single page remains
  out of scope for the same reason it was there.

## Decision 4: Signed-in entry point follows the existing per-view `AppShell` pattern exactly

**Decision**: `App.tsx` gets a `view === "help"` branch, structured identically to every other view
(`AppShell` wrapping a `LazyViewBoundary`-wrapped, lazily-imported `HelpView`), and `AppShell.tsx`
gets a 10th `NAV_ITEMS` entry with a new `HelpIcon` (path data ported from the design source's
`nav.help` SVG — a circle with a question mark).

**Rationale**: Every other nav destination already follows this exact shape; deviating for Help
would be an inconsistency with no benefit. `HelpView` itself (the two-pane section-list + content
component) is the one piece of UI shared between this signed-in entry point and `LandingPage`'s
signed-out one (Decision 3) — same component, two call sites, per plan.md's Structure Decision.
