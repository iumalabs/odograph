# Feature Specification: RU/EN Language Toggle

**Feature Branch**: `060-ru-en-language-toggle`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "New: RU/EN language toggle (i18n). The updated design (Claude Design project dfecc39c-323d-4b89-a9ec-c126b3aa2deb, file 'Кокпит - прототип.dc.html') adds a RU/EN language toggle to both the landing page header and the authed app header. Decide on an i18n approach, translate all existing UI copy to Russian, matching the design's own RU strings where the design provides them. Needs a /speckit-specify pass — this is cross-cutting infrastructure, not a small UI addition; every future UI addition will need to go through whatever pattern gets chosen here. Tracked as GitHub issue #233 on iumalabs/odograph."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A Russian-reading visitor switches the whole app to Russian (Priority: P1)

A visitor clicks a small RU/EN toggle in the header (landing page or, once signed in, the app
shell) and every piece of UI copy — nav labels, buttons, headings, empty states, form labels,
banners, error messages — switches to Russian immediately, without a page reload. The choice
persists across visits.

**Why this priority**: This is the entire scope of issue #233 and the only user-facing behavior it
asks for.

**Independent Test**: Click the toggle, confirm visible UI text across several different screens
switches language without a reload; reload the page and confirm the choice persisted; click the
toggle again and confirm it switches back.

**Acceptance Scenarios**:

1. **Given** the landing page, **When** a visitor clicks the RU/EN toggle, **Then** the landing
   page's headline, lead copy, sign-in card, and header all switch to Russian immediately.
2. **Given** a signed-in user on any screen, **When** they click the RU/EN toggle in the app
   header, **Then** the nav rail labels, the current screen's content, and every other visible UI
   string switch to Russian immediately, with no page reload.
3. **Given** a visitor who selected Russian, **When** they reload the page or return in a new
   session, **Then** the app still shows Russian.
4. **Given** a Russian-language session, **When** the visitor clicks the toggle again, **Then** the
   app switches back to English.

---

### Edge Cases

- What happens to server-rendered content — the transactional email templates (magic-link,
  reminder notifications) and the redirect-driven outcome banners? Unchanged and out of scope —
  Constitution Principle IX's "interface language" axis governs the client UI; the email templates
  already have their own, separate, deliberately-English-only precedent (specs/055 plan.md), and
  this feature doesn't touch server-rendered content.
- What happens to user-entered data (vehicle names, service descriptions, notes)? Unchanged — this
  toggle only affects the app's own UI chrome/copy, never data the user typed in, which already
  appears in whatever language they wrote it in (matches the issue's own framing).
- What happens to a `{param}`-templated string where the interpolated value is a number (e.g. "In
  {value} days", "{count} photos")? Russian's grammatical case system means a single fixed word
  form (e.g. always "дней") isn't grammatically correct for every count (1/2/5), the same limitation
  every simple key-value i18n system without a pluralization engine has. This feature ships the
  same simplified, single-form approach the existing `t()` system already uses for English (which
  has its own, milder version of the same simplification — "1 photos" instead of "1 photo") — full
  grammatical pluralization is out of scope (see Assumptions).
- What happens to units/currency (km vs. mi, $ vs. €)? Completely unaffected — Constitution
  Principle IX explicitly requires interface language and vehicle/data locale to be separate,
  independent settings; this feature only ever touches the language axis.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST add a Russian (`ru`) translation for every existing UI string key in
  `src/client/i18n/strings.ts`'s `en` locale — the toggle is only meaningful once every screen has
  a real translation, not a partial one that leaves some screens silently still in English.
- **FR-002**: The app MUST add an RU/EN toggle control to both the landing page header and the
  authenticated app shell's header, matching the design source's placement.
- **FR-003**: Clicking the toggle MUST switch every currently-rendered UI string to the selected
  language immediately, without a page reload.
- **FR-004**: The selected language MUST persist across page reloads and future visits (same
  per-device persistence approach as the existing theme/currency/distance-unit preferences).
- **FR-005**: Interface language MUST remain a setting fully independent of currency and distance
  unit — switching language MUST NOT change either, and vice versa (Constitution Principle IX).
- **FR-006**: Server-rendered content (transactional email templates, any server-generated
  redirect/outcome text) is explicitly OUT of scope — this feature only affects client-rendered UI
  chrome.
- **FR-007**: Every new call site introduced by this feature (the toggle control itself) MUST route
  its own copy through the same `t()` key system as every other string — no hardcoded "RU"/"EN"
  literal outside the translation table.

### Key Entities

This feature has no new data entities — the selected language is a client-side, per-device
preference (same storage mechanism as the existing theme preference), not server-persisted data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the app's existing UI string keys have a real Russian translation — no
  screen silently stays in English after switching to Russian.
- **SC-002**: A visitor can switch the entire app's language with one click, with the change
  visible on every currently-rendered screen with no reload.
- **SC-003**: The chosen language persists across a reload and a new session, independent of any
  other preference (currency, distance unit, theme).

## Assumptions

- **No grammatical pluralization engine.** Russian noun/adjective forms change with count (1 день /
  2 дня / 5 дней) in a way English's simpler singular/plural split doesn't fully capture either
  (English already accepts "1 photos" as a known simplification in this codebase). This feature
  translates each `{param}`-templated string using the most natural, broadly-acceptable single form
  for UI copy (the same simplification pattern already implicit in the English strings), not a full
  ICU-style plural-rules system — that would be materially larger scope than what issue #233 asks
  for, and no existing precedent in this codebase does it for English either.
- **Design source RU strings are a reference, not copied verbatim everywhere.** The design's
  bilingual copy covers its own (partly fictional — see specs 056/057/058/059's corrections) content
  and uses different key names than this app's real `strings.ts`. Where a design RU string
  genuinely matches something this app's real key means, it's used as a strong reference; every key
  that's specific to this app's real behavior (including every key added in specs 055–059, none of
  which exist in the original design at all) gets an original, accurate Russian translation.
- **Persistence mirrors the existing theme preference** (`localStorage`, per-device, no server
  round-trip) — the same mechanism `src/client/theme.ts` already uses, not a new pattern.
- **No change to server-rendered content** (FR-006) — matches specs/055's already-established
  precedent that server-side email content doesn't route through the client `t()` system.
