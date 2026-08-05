# Phase 0 Research: Design System Integration

## Font hosting: self-hosted npm packages vs. third-party CDN

**Decision**: Self-host via `@fontsource/onest` and `@fontsource/jetbrains-mono` npm packages,
imported as CSS in `src/client/design/base.css`, declared as `npm:` specifiers in `deno.json`.

**Rationale**: Odograph is an open-source, self-hostable product (README, D-001) — a Google Fonts
`<link>` would send every visitor's IP to a third party on first load and would silently break for
anyone self-hosting without external network access. `@fontsource` packages ship the actual woff2
files and a plain CSS `@font-face` block; Vite bundles them like any other static asset with no
runtime dependency on an external host. Both packages exist on npm (verified: `@fontsource/onest`,
`@fontsource/jetbrains-mono`, both 5.3.0) and support variable-weight builds, matching the
mockups' 400-800 (Onest) / 400-700 (JetBrains Mono) weight ranges from a single file each.

**Alternatives considered**:
- **Google Fonts CDN `<link>`**: rejected — third-party request on every page load, privacy/self-
  hosting mismatch, and an extra point of failure for offline/restricted-network deployments.
- **System font stack only (no custom fonts)**: rejected — the design's identity (large mono
  telemetry numbers, Onest headings) is a defining part of the approved look; falling back to
  system fonts is the *degraded* case (FR-010), not the target state.

## CSS approach: custom properties vs. CSS-in-JS vs. a UI framework

**Decision**: Plain CSS with `:root`-scoped custom properties for tokens (colors, spacing, radius,
font stacks), toggled between dark/light via a `[data-theme]` attribute on `<html>`; component
styles as scoped class names in the same stylesheet(s), no CSS Modules or CSS-in-JS library.

**Rationale**: The existing client has zero styling dependencies today (plain unstyled JSX); the
mockups already define their palette as CSS custom properties (`--bg`, `--panel`, `--acc`, etc.),
so porting those 1:1 into a real stylesheet is the most direct, lowest-dependency path — no new
runtime library, no build-step change beyond Vite's existing CSS handling. A `[data-theme="light"]`
attribute selector is the simplest mechanism for FR-004 (toggle) and composes cleanly with
`prefers-color-scheme` as a future enhancement without being required now.

**Alternatives considered**:
- **Tailwind CSS**: rejected — would require translating the mockups' exact custom-property values
  into a Tailwind config for no real benefit at this scope (3 screens); adds a build-step
  dependency and a learning-curve/consistency cost not justified here.
- **CSS-in-JS (e.g. styled-components, vanilla-extract)**: rejected — new runtime or build
  dependency for a feature explicitly scoped to "no new API, presentation-only"; plain CSS already
  covers everything the mockups specify (custom properties, flat borders, no complex dynamic
  styling logic).

## Icon set: library vs. hand-rolled inline SVG

**Decision**: Hand-roll a small set of inline SVG icon components (`src/client/design/icons.tsx`)
matching the mockups' exact spec (24×24 viewbox, 20×20 live area, stroke-width 1.75, round
caps/joins, `fill="none"`, `stroke="currentColor"`) — only the icons actually used by in-scope
screens: garage (nav), service records/wrench (nav), add (+), attach/upload, close, and the
vehicle/car glyph. The theme toggle uses the mockups' literal `◐` Unicode character, not an SVG,
per the design's own convention (confirmed across all three mockup files).

**Rationale**: An icon library (e.g. lucide-react) would pull in a large icon set to use ~6 icons,
none of which are guaranteed to match the mockups' specific stroke weight and style. The mockups'
icons are simple enough (single-path or two-path strokes) to hand-roll precisely, keeping the
dependency surface at zero and guaranteeing pixel-accurate match to the approved design — same
reasoning the project already applied to the magic-byte/EXIF-stripping code in spec 007.

**Alternatives considered**:
- **lucide-react / heroicons**: rejected — dependency for a handful of icons, imprecise match to
  the mockups' specific stroke spec, and most of each library's icon set would go unused.
- **Full icon set from the mockups (all 31 icons across nav/entity/action groups)**: rejected —
  spec.md Assumptions explicitly scope this feature to icons for real, working screens only;
  building the rest now would be unused code for features that don't exist yet (fuel, dashboard,
  reminders, documents, planner).

## Theme persistence: localStorage vs. server-side user setting

**Decision**: `localStorage`, read on mount and written on toggle, no network round-trip.

**Rationale**: No user-settings storage exists anywhere in the current schema (D1 has no
`user_settings`/`preferences` table), and creating one is out of scope for a presentation-only
feature (spec.md Assumptions). `localStorage` satisfies FR-005 ("persist... across page reloads
and future sessions on the same device") exactly as scoped — "same device" rules out needing
server-side sync, which would be the only reason to prefer a server-stored setting.

**Alternatives considered**:
- **New `user_settings` D1 table + API endpoint**: rejected as scope creep — spec.md explicitly
  bounds this feature to "no new API endpoints, no new backend functionality."
- **Respect `prefers-color-scheme` only, no manual toggle**: rejected — spec.md User Story 4 and
  FR-004 explicitly require a user-operable toggle, since the design specifies both themes as
  first-class, not just an OS-preference fallback.

## Component split: single App.tsx vs. extracted components

**Decision**: Extract `AuthScreen`, `Garage`, and `ServiceRecordPanel` as separate components
under `src/client/components/`, keeping `App.tsx` as the composition root that holds shared state
(identity, vehicles, selected vehicle, error) and passes it down as props — same state-ownership
shape as today, just split across files.

**Rationale**: `App.tsx` is already ~190 lines of unstyled JSX before this feature; adding real
markup, empty states, and per-screen styling classes for 3 screens in one file would make it hard
to review and maintain. Splitting by screen mirrors how the mockups themselves are organized (one
screen = one concern) without changing the underlying state model — this is a mechanical extraction,
not a new architecture (no routing library, no global state manager introduced).

**Alternatives considered**:
- **Keep everything in one `App.tsx`**: rejected — file would grow past ~500 lines with styled
  markup for 3 screens plus forms, empty states, and theme toggle wiring; harder to review as one
  diff and harder to maintain going forward.
- **Introduce a router (react-router) for screen navigation**: rejected — the app has no URL-based
  navigation today (state-based conditional rendering only) and this feature doesn't need one;
  adding routing is unrelated scope creep for a presentation-only restyle.
