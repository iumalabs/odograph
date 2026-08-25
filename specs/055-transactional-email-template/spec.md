# Feature Specification: Styled Transactional Email Template

**Feature Branch**: `055-transactional-email-template`

**Created**: 2026-08-25

**Status**: Draft

**Input**: User description: "Styled transactional email template: replace the unstyled magic-link email (src/server/auth/magic-link.ts) with a single reusable, chrome-separated HTML email template (dark header with logo+purpose tag, white body with headline/greeting/lime CTA button, grey expiry strip, monospace request-details table, fallback plain-text link, dark footer), matching the design in Claude Design project dfecc39c-323d-4b89-a9ec-c126b3aa2deb file "Письмо - ссылка для входа.html". The template's content (headline, body copy, CTA URL, details rows) should vary per the 3 existing magic-link purposes (new-account, sign-in, link) via a shared chrome/content-slot structure, inline-styled (no external CSS/<style> blocks, for email client compatibility). Also consider reusing the same chrome for src/server/email/reminder-notification.ts's currently-unstyled email. Tracked as GitHub issue #235 on iumalabs/odograph."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A user receives a branded, trustworthy sign-in email (Priority: P1)

A person requests a magic-link email (new account, returning sign-in, or linking an email to an
existing passkey/Google account) and receives an email that visibly looks like it came from
odograph — not a bare, unstyled line of text — with a clear call-to-action button, an expiry
notice, and enough context about the request (when, from where) to judge whether it's legitimate
before clicking.

**Why this priority**: This is the entire scope of issue #235 and the only user-facing surface
this feature touches. Every one of the app's 3 magic-link purposes (new-account, sign-in, link)
goes through this one screen, so it's also the highest-leverage single change — every user sees
it at least once (account creation), and returning users may see it repeatedly.

**Independent Test**: Trigger each of the 3 magic-link purposes (sign up with a new email, request
a sign-in link for an existing account, link an email to an already-authenticated account) and
confirm the received email has the full styled structure, correct purpose-specific copy, and a
working link — deliverable and verifiable without touching the reminder-notification email at all.

**Acceptance Scenarios**:

1. **Given** a visitor with no odograph account, **When** they request a magic link to sign up,
   **Then** they receive a styled email whose headline and body copy reflect "create your
   account," with a working sign-in button.
2. **Given** an existing user, **When** they request a sign-in link, **Then** they receive a
   styled email whose headline and body copy reflect "sign in," with a working sign-in button.
3. **Given** an authenticated user linking a new email address to their account, **When** they
   submit that email, **Then** they receive a styled email whose headline and body copy reflect
   "confirm linking this email," with a working confirmation button.
4. **Given** any of the above emails, **When** the recipient's email client can't or won't render
   the button (plain-text clients, images/buttons blocked), **Then** the same destination URL is
   also present as visible, selectable plain text elsewhere in the email.
5. **Given** any of the above emails, **When** the recipient views it in a client that doesn't
   support external stylesheets (Gmail, Outlook, Apple Mail, etc.), **Then** the layout, colors,
   and button still render as designed — nothing depends on styles the client might strip.

---

### User Story 2 - Reminder notification emails share the same visual identity (Priority: P2)

A user who receives a maintenance/document-expiry reminder by email sees an email that's visually
consistent with the sign-in email above — same header/footer chrome, same button styling — rather
than the app having two different-looking transactional emails.

**Why this priority**: Explicitly called out as a "consider" in the source request, not a hard
requirement — the sign-in email (User Story 1) is the one with an actual design reference and the
one issue #235 is scoped around. This extends the same reusable chrome to a second, already-live
sending path once it exists, rather than blocking on a design that doesn't cover it yet.

**Independent Test**: Trigger a reminder-due notification email and confirm it uses the same
header/footer/button chrome as the sign-in email, with reminder-specific content (which
item, which vehicle, due date) in the content slot instead of a sign-in CTA.

**Acceptance Scenarios**:

1. **Given** a reminder becomes due and the owner has a deliverable email on file, **When** the
   notification email sends, **Then** it uses the same header/footer/button chrome as the sign-in
   email, with reminder-specific headline and details instead of a sign-in link.

---

### Edge Cases

- What happens when the request-details fields (device, IP) aren't available or can't be
  determined for a given request? The row for that field is omitted rather than showing a
  fabricated or placeholder value (Principle IV — no interpolated data).
- What happens when the recipient's name isn't known (e.g., a brand-new signup where no
  display name exists yet)? The greeting omits the name rather than showing a placeholder like
  "Hi there."
- What happens in local development / preview environments, where sent mail is captured rather
  than actually delivered? The same styled template renders identically — environment only
  affects delivery, never template content or structure.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST send every magic-link email (new-account, sign-in, and link
  purposes) using one shared visual template — a dark header (product mark + a short label
  naming the email's purpose), a white body area, and a dark footer — rather than each purpose
  having its own separately-styled email.
- **FR-002**: The template MUST render correctly (correct layout, colors, and a working button)
  in email clients that don't support external stylesheets, since mainstream webmail/desktop
  clients never load them. A single embedded `<style>` block for a narrow-viewport responsive
  breakpoint (FR-009) is permitted — clients that strip `<style>` blocks entirely (some desktop
  Outlook versions) MUST still fall back to a correct, legible desktop-width layout, never a
  broken one.
- **FR-003**: Every magic-link email (all 3 purposes) MUST present its action (sign in / confirm)
  as a single, visually prominent button linking to the action URL already generated for that
  purpose today. This does not apply to the reminder-notification email (User Story 2), which has
  no equivalent single action URL today.
- **FR-004**: Wherever FR-003's button appears, the same destination URL MUST also be present as
  plain, selectable text, for recipients whose client can't or won't render the button.
- **FR-005**: Every magic-link email MUST state the link's expiry window and single-use nature in
  plain language, matching the actual expiry already enforced server-side today (15 minutes, one
  use). Not applicable to the reminder-notification email, which has no link to expire.
- **FR-006**: Every magic-link email MUST show a "didn't request this?" note telling the recipient
  it's safe to ignore, without referencing any access-control mechanism or policy the app doesn't
  actually have (see Assumptions — the source design's wording doesn't match this app's real auth
  model and must not be copied verbatim).
- **FR-007**: Each email SHOULD show request context (the account the link is for, and — only
  when genuinely available from the request — an approximate origin) to help the recipient judge
  legitimacy; the system MUST NOT display a fabricated or best-guess value for a field it can't
  actually determine (Principle IV).
- **FR-008**: The headline, body copy, and call-to-action label MUST vary per magic-link purpose
  (new-account vs. sign-in vs. link) while reusing the same surrounding chrome, so adding a future
  4th purpose doesn't require a new template.
- **FR-009**: The template MUST remain legible and usable at narrow (mobile email client) widths
  — the content column narrows to fill the viewport and the headline/side padding scale down
  accordingly — not only on a desktop-width viewport.
- **FR-010**: The reminder-notification email (separate from magic-link, sent on a different
  trigger) SHOULD reuse the same header/footer/button chrome once this template exists, with its
  own reminder-specific content in place of a sign-in call-to-action.

### Key Entities

- **Email template**: The shared visual chrome (header, body frame, button style, footer) plus a
  content slot (headline, body copy, call-to-action label/URL, optional detail rows) that each
  sender fills in per email purpose.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A recipient can identify, within the first few seconds of opening any transactional
  email from the app, that it's a legitimate email from odograph (visually branded, not a bare
  line of unstyled text) and what action it's asking them to take.
- **SC-002**: 100% of magic-link emails (all 3 purposes) and the reminder-notification email
  render with correct layout and a working call-to-action across the sending path's supported
  clients, with no regression in link deliverability versus today (issue #223 already fixed
  actual delivery; this feature must not reintroduce a delivery failure).
- **SC-003**: A recipient whose email client can't render the button can still complete the
  intended action (sign in, confirm link, view reminder) using only plain visible text in the
  email.

## Assumptions

- **Design source fidelity, with one deliberate departure**: `Письмо - ссылка для входа.html`
  (Claude Design project `dfecc39c-323d-4b89-a9ec-c126b3aa2deb`) is followed for chrome and layout
  (dark header with logo chip + purpose tag, white body, lime `#D4FF3F` CTA button, grey expiry
  strip, monospace detail rows, dark footer). Its copy referencing "rotate your Access policy" is
  **not** carried over — this app has no Cloudflare Access / policy concept (confirmed fictional
  placeholder text in the design, already flagged separately by QA against the related
  landing-page/account-page/docs-viewer tickets #229–#231). FR-006's "didn't request this?" note
  is rewritten to match this app's real auth model instead.
- **Request-details fields use only real, already-available data.** The design mock shows a
  city-level IP geolocation ("Moscow") and a parsed device summary ("macOS · Safari 19"), neither
  of which this app currently computes and neither of which can be added without either an extra
  reverse-geocoding dependency (city-level location) or accepting a best-effort/possibly-wrong
  parse of the User-Agent string. Per FR-007 and Constitution Principle IV (no interpolated
  data), only fields backed by real request data the Worker already has for free (e.g. the
  connecting IP, country-level origin if available) are shown; anything that would require
  fabricating precision the system doesn't actually have is omitted for this pass rather than
  faked.
- **Reminder-notification reuse (User Story 2) is best-effort, not design-verified.** No design
  file covers the reminder email specifically — its content slot is filled with the same
  reminder details it already sends today, just inside the shared chrome from User Story 1.
- **Delivery mechanics are unaffected.** This feature only changes what's rendered inside the
  `html`/`text` bodies already being sent (via the `EMAIL.send()` path fixed in #223); it does not
  change sender address, routing, or the environment gating that already exists.
