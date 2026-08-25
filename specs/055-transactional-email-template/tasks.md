# Tasks: Styled Transactional Email Template

**Input**: Design documents from `/specs/055-transactional-email-template/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Plain unit tests against the renderer as a pure function, matching this project's
existing convention for non-route internal logic (e.g. `tests/server/monitoring.test.ts` testing
`buildServerMonitoringConfig` directly) — not `SELF.fetch` route tests, since this feature adds no
route.

## Phase 1: Setup

None — no new dependency, no new directory; `src/server/email/` already exists
(`reminder-notification.ts` already lives there).

## Phase 2: Foundational

**Purpose**: The shared chrome renderer both user stories depend on.

- [X] EMT-001 `src/server/email/template.ts` (new file): define the `EmailContent` type and
      `renderEmailHtml(content)` / `renderEmailText(content)` functions per data-model.md —
      table-based, fully inline-styled HTML matching the design source's chrome (dark header with
      logo chip + `purposeTag`, white body with `headline`/`bodyText`, a lime `#D4FF3F` CTA button
      rendered only when `ctaLabel`/`ctaUrl` are both set, a grey `expiryNote` strip rendered only
      when non-null, a monospace `details` rows table rendered only for entries actually present
      (never a fixed set of rows with blanks), a `fallbackNote` block rendered only when non-null,
      and a dark footer). `renderEmailHtml`'s `<head>` includes one embedded `<style>` block
      porting the design source's `@media only screen and (max-width:620px)` responsive
      breakpoint (FR-009) — narrows the content column, scales down the headline size — with the
      rest of the markup styled entirely inline so a client that strips `<style>` blocks still
      renders a correct, legible desktop-width layout (FR-002's fallback). `renderEmailText`
      produces the plain-text equivalent (FR-004's fallback link requirement is satisfied by both
      `ctaUrl` and, when present, `fallbackNote` appearing as plain text in this output, not by a
      separate mechanism).

**Checkpoint**: `template.ts` type-checks and is unit-reachable; nothing wired to a sender yet, so
no email's actual output changes until Phase 3.

---

## Phase 3: User Story 1 - A user receives a branded, trustworthy sign-in email (Priority: P1) 🎯 MVP

**Goal**: All 3 magic-link email purposes (new-account, sign-in, link) render through the shared
chrome with purpose-specific copy, instead of the current bare `<p><a>...</a></p>` markup.

**Independent Test**: Trigger each of the 3 magic-link purposes and confirm the captured email has
the full styled structure per quickstart.md scenarios 1–4, without touching
`reminder-notification.ts` at all.

### Implementation for User Story 1

- [X] EMT-002 [US1] `src/server/auth/magic-link.ts`: replace the current inline `html`/`text`
      construction in `sendMagicLinkEmail` with a per-purpose `EmailContent` object (extend the
      existing `SUBJECTS`/`ACTIONS` pattern with a `purposeTag`/`headline` per
      `MagicLinkEmailPurpose`, per data-model.md's per-purpose table — `"NEW ACCOUNT"` /
      `"SIGN-IN LINK"` / `"CONFIRM EMAIL"`), call `renderEmailHtml`/`renderEmailText` from
      `template.ts`. `ctaUrl` is the existing `verifyUrl`; `expiryNote` states the real 15-minute/
      single-use expiry (FR-005); `details` includes `ACCOUNT` (`input.email`) and `INSTANCE`
      (hostname parsed from `input.requestUrl`) — no device/IP row (research.md decision);
      `fallbackNote` restates "safe to ignore" without any access-policy/Cloudflare Access
      reference (FR-006, spec Assumptions).

### Tests for User Story 1

- [X] EMT-003 [P] [US1] New `tests/server/email-template.test.ts`: unit-test
      `renderEmailHtml`/`renderEmailText` directly (no route, no DB) — each of the 3 magic-link
      purposes' content produces non-empty `html` and `text` both containing `ctaUrl` (FR-004),
      the purpose's `expiryNote` text (FR-005), and the purpose's `fallbackNote` text (FR-006); a
      content object with `ctaLabel`/`ctaUrl` set to `null` renders with no button markup at all;
      a `details` array missing an entry never renders a fabricated placeholder for it — the row
      is simply absent (Principle IV); the rendered `html` contains exactly one `<style>` block
      (the FR-009 responsive breakpoint) and no `<link rel="stylesheet">` (FR-002 — everything
      else must be inline); stripping that one `<style>` block from the rendered output still
      leaves a well-formed, non-empty layout (FR-002's no-`<style>`-support fallback).

**Checkpoint**: User Story 1 fully functional and testable independently — every magic-link email
purpose now renders through the shared chrome. Reminder-notification email is unaffected.

---

## Phase 4: User Story 2 - Reminder notification emails share the same visual identity (Priority: P2)

**Goal**: The reminder-due email reuses the same header/footer/button chrome, with no button
section (no target URL exists for it today — research.md decision).

**Independent Test**: Trigger a reminder-due notification and confirm the captured email uses the
same chrome as the magic-link emails, per quickstart.md scenario 5, without needing US1's specific
copy to have shipped in any particular way beyond the shared `template.ts` module existing.

### Implementation for User Story 2

- [X] EMT-004 [US2] `src/server/email/reminder-notification.ts`: replace the current inline
      `html`/`text` construction in `sendReminderDueEmail` with an `EmailContent` object
      (`purposeTag: "REMINDER"`, `headline`/`bodyText` built from the existing
      `itemLabel`/`vehicleName`/`statusText` values — same information already sent today, just
      through the shared chrome — `ctaLabel`/`ctaUrl`/`expiryNote`/`fallbackNote` all `null`,
      `details: []`), call the same `renderEmailHtml`/`renderEmailText` from `template.ts`.

### Tests for User Story 2

- [X] EMT-005 [P] [US2] Extend `tests/server/email-template.test.ts`: the reminder-shaped content
      object (no CTA, no expiry, no details, no fallback note) renders header/footer chrome with
      none of those optional sections present — confirms the renderer's "all-optional-sections-
      omitted" path, distinct from EMT-003's magic-link cases which exercise them all present.
- [X] EMT-006 [US2] Run the existing `tests/server/reminder-rules.test.ts` and
      `tests/server/document-reminders.test.ts` suites and confirm they still pass unmodified —
      neither asserts on email body shape today (verified during planning), so this is a
      regression check, not a rewrite.

**Checkpoint**: Both user stories independently functional. Every transactional email the app
sends (magic-link ×3, reminder) now shares one visual identity.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] EMT-007 Run `deno task check` (fmt, lint, typecheck, full suite, build) — all green.
- [X] EMT-008 Work through quickstart.md's manual validation steps 1–6 against a local
      `deno task dev` session (captured email files under `/tmp/miniflare-*/email/`), including
      the client-compatibility spot check (no external CSS, layout doesn't collapse).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: None — nothing to do.
- **Foundational (Phase 2)**: No dependencies. BLOCKS Phase 3 and Phase 4 (both call
  `template.ts`).
- **User Story 1 (Phase 3)**: Depends on Phase 2 only. No dependency on User Story 2.
- **User Story 2 (Phase 4)**: Depends on Phase 2 only. Independently testable even if Phase 3
  were skipped — but ship both together per spec.md's P1+P2 framing.
- **Polish (Phase 5)**: Depends on both user stories being complete.

### Parallel Opportunities

- EMT-003 and EMT-005 both touch the same new test file (`tests/server/email-template.test.ts`)
  — not truly parallel with each other despite the `[P]` marker being technically about
  cross-story independence; write EMT-003 first, then extend it with EMT-005's cases in the same
  file rather than racing two edits to one file.
- EMT-002 (US1) and EMT-004 (US2) touch different files and have no dependency on each other once
  Phase 2 is done — genuinely parallelizable.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 (nothing to do) → Phase 2 (EMT-001) → Phase 3 (EMT-002, EMT-003).
2. **STOP and VALIDATE**: quickstart.md scenarios 1–4 against a local magic-link request.
3. This alone closes the actual issue #235 ask (magic-link email is the one with a real design
   source); User Story 2 is a bonus extension of the same work.

### Incremental Delivery

1. Phase 2 → shared renderer exists, nothing user-visible changes yet.
2. Phase 3 → magic-link emails styled (MVP, closes #235's primary ask).
3. Phase 4 → reminder emails adopt the same chrome.
4. Phase 5 → full-suite check + manual sign-off.
