# Feature Specification: In-App Documentation Viewer

**Feature Branch**: `057-in-app-documentation`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "New: in-app Documentation / Help viewer. The updated design (Claude Design project dfecc39c-323d-4b89-a9ec-c126b3aa2deb, file 'Кокпит - прототип.dc.html', 'scr.help' state) adds a new in-app Documentation/Help screen, plus a new Help icon in the left nav rail. Left sidebar: numbered section list. Right pane: structured content blocks (headings, paragraphs, bulleted lists, code blocks, note callouts) with prev/next pagination. The design's placeholder content describes an architecture odograph does not have (Cloudflare Access as sole auth, a cloudflared tunnel, Docker self-hosting) — this must not ship verbatim. Before this ships, doc content must be rewritten from scratch to describe the app's real auth methods (passkey/magic-link/Google) and its real wrangler-based self-hosting path (docs/self-hosting.md). Tracked as GitHub issue #230 on iumalabs/odograph."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A signed-in user finds accurate help without leaving the app (Priority: P1)

A signed-in user who wants to understand a feature — how fuel economy is computed, how reminders
trigger, how to get an API token — opens a new "Help" nav destination and reads structured,
accurate documentation about the product they're actually using, without navigating away to a
separate site.

**Why this priority**: This is the entire scope of issue #230 and the only way the in-app viewer
provides value — every word of it must describe the real product, or it actively misleads instead
of helping (the design's placeholder content fails this today).

**Independent Test**: Sign in, click "Help" in the nav rail, and confirm a two-pane documentation
screen renders — a section list on the left, structured content (headings/paragraphs/lists/code
blocks/notes) on the right — with every factual claim (auth methods, how consumption is computed,
how self-hosting works) matching the real, already-implemented behavior.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they click "Help" in the nav rail, **Then** they see a
   section list (at least: Getting started, Signing in, Fuel & consumption, Service & reminders,
   API access, Self-hosting) and the first section's content in the right pane.
2. **Given** the Help screen, **When** the user clicks a different section in the sidebar, **Then**
   the right pane updates to that section's content and the sidebar highlights it as active.
3. **Given** the Help screen, **When** the user reads the "Signing in" section, **Then** it
   describes passkey (primary), magic link, and Google sign-in — never Cloudflare Access, a JWT
   header, or a `cloudflared` tunnel.
4. **Given** the Help screen, **When** the user reads the "Self-hosting" section, **Then** it
   describes the real `wrangler`-based deploy path (matching `docs/self-hosting.md`) — never a
   `docker run` command, since this app has no Docker image.
5. **Given** the Help screen, **When** the user is on a section other than the first or last, **Then**
   prev/next controls step to the adjacent section; on the first section prev is disabled/absent,
   and on the last section next is disabled/absent.

---

### User Story 2 - The public landing page's documentation link opens this real viewer (Priority: P2)

The landing page shipped in issue #229 currently links "Documentation" to the project's public
GitHub README as a stopgap, explicitly because this in-app viewer didn't exist yet. Once it exists,
an unauthenticated visitor's documentation link should reasonably still work — this story confirms
that outcome without requiring the visitor to sign in.

**Why this priority**: A natural, low-effort follow-on once User Story 1 exists — the Help content
itself has no reason to require a session (it's static, describes the product to anyone), so making
it visitable unauthenticated is a small addition, not a new content effort.

**Independent Test**: While signed out, open the same Help content the landing page's
"Documentation" link points to, and confirm it renders without requiring a sign-in first.

**Acceptance Scenarios**:

1. **Given** an unauthenticated visitor on the landing page, **When** they click "Documentation",
   **Then** they see the same structured Help content a signed-in user sees — not a sign-in wall,
   and not the external GitHub README anymore.

---

### Edge Cases

- What happens if a user is on the Help screen and their session expires mid-read (`needsReauth`)?
  Same as every other view today — they're returned to the landing page (specs/056); Help itself
  has no unsaved-state risk since it's read-only.
- What happens on a narrow (mobile) viewport? The two-column layout (section list + content) stacks
  to one column, following the app's existing responsive breakpoint convention, and the section
  list becomes a horizontally scrollable strip or a stacked list above the content — not a layout
  that clips or hides sections.
- What happens if a future section needs a fact this app genuinely doesn't have yet (e.g. a feature
  that isn't built)? The content simply doesn't claim it — nothing here documents aspirational or
  planned functionality as if it already worked (Constitution Principle IV, applied to documentation
  content rather than data).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST add a "Help" destination to the nav rail (a new icon, alongside the
  existing eight), taking the user to a new two-pane documentation screen.
- **FR-002**: The documentation screen MUST show a section list (left pane) and the selected
  section's structured content (right pane: heading, lead paragraph, then ordered content blocks
  of type heading/paragraph/bulleted-list/code/note).
- **FR-003**: Selecting a different section in the list MUST update the right pane's content and
  visibly mark the selected section as active in the list.
- **FR-004**: The documentation screen MUST provide prev/next navigation between sections in list
  order, disabled or absent at the first/last section respectively.
- **FR-005**: Every factual claim in the shipped content MUST describe this app's real,
  already-implemented behavior — real auth methods (passkey, magic link, Google OIDC), the real
  wrangler-based self-hosting path, and the real mechanics of whichever other features are
  documented (fuel-economy calculation, reminder triggering, API tokens). The design source's
  placeholder content (Cloudflare Access, `cloudflared`, Docker) MUST NOT be carried over in any
  form (Constitution Principle IV, applied to documentation accuracy).
- **FR-006**: The documentation content MUST be reachable without an active session — both for
  User Story 2 (the landing page's documentation link) and because a prospective user evaluating
  the product before signing up has the same legitimate need to read it as a signed-in user.
- **FR-007**: The documentation screen MUST remain usable at narrow (mobile) viewport widths,
  following the app's existing responsive breakpoint convention.
- **FR-008**: All nav-chrome and UI strings (nav label, "Sections" heading, prev/next labels) MUST
  route through the existing i18n `t()` system (Constitution Principle IX), matching every other
  screen in the app. The documentation prose content itself (section titles, leads, block text)
  lives in one dedicated, centrally-organized module rather than scattered inline strings — see
  plan.md's Constitution Check for why this satisfies Principle IX's actual intent (avoiding a
  large, error-prone rewrite when localization is eventually added) without literally being `t()`
  keys for every sentence of prose.

### Key Entities

- **Documentation section**: A titled, kicker-labeled, lead-paragraph-introduced unit of static
  content, containing an ordered list of content blocks (heading / paragraph / bulleted list / code
  sample / note callout). Purely static, bundled with the client — no persistence, no per-user
  state beyond "which section is currently selected" (client-side UI state only).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can find and read documentation about any of the app's real core features
  (sign-in, fuel/consumption, service/reminders, API access, self-hosting) without leaving the app.
- **SC-002**: 100% of factual claims in the shipped documentation content match this app's real,
  currently-implemented behavior — zero references to Cloudflare Access, `cloudflared`, Docker, or
  any other mechanism the app doesn't have.
- **SC-003**: An unauthenticated visitor can read the same documentation content as a signed-in
  user, without being asked to sign in first.

## Assumptions

- **Content model: static, client-bundled, centrally organized — not a CMS or server-fetched
  content.** No new dependency, no new API route, matches this project's simplicity bias for a
  purely informational, rarely-changing screen. See plan.md/research.md for how this still respects
  Constitution Principle IX (i18n) despite not being literal `t()` keys per sentence.
- **Six sections, not the design's seven** — chosen for what this app can describe *accurately*
  today: Getting started, Signing in, Fuel & consumption, Service & reminders, API access,
  Self-hosting. The design's "Гараж и документы" (gallery/documents) section content is folded into
  "Getting started" 's feature overview rather than getting its own section, since there isn't
  enough distinct *mechanism* to document beyond what "Getting started" already covers; "Аккаунт и
  данных" (account/data) content that was real (GDPR-style account deletion) is folded into
  "Signing in" rather than a standalone section built around mostly-fictional multi-account content.
- **Self-hosting section is a condensed, in-app-appropriate summary of `docs/self-hosting.md`**, not
  a duplicate of the full guide — it links out to the full document for the complete step-by-step
  (the existing `docs/self-hosting.md` on GitHub remains the canonical, complete reference).
- **No content editing UI.** This is a read-only viewer; authoring/updating doc content happens by
  editing the source file in the repo, like any other code change — not a CMS feature.
- **English-only content**, matching the app's locked v1-English-only scope (Constitution Principle
  IX/XI); the design's RU/EN toggle is separate, not-yet-built work (issue #233).
