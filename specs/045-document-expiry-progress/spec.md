# Feature Specification: Document Expiry Progress Bar

**Feature Branch**: `045-document-expiry-progress`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Documents don't show a visual expiry countdown progress bar (GitHub
issue #142). The mockup shows a percentage-based progress bar under each document card. The real
Documents screen shows only text badges. A document's expiryDate is real data, but computing
'percentage of the way to expiry' needs a reference start point this data model doesn't have (no
issued/valid-from date, only an expiry date). Resolve by reusing the existing fixed 30-day
coming-up window (already used to classify a document's reminderStatus) as the bar's denominator,
rather than inventing a start-of-validity date — the bar only appears once a document enters that
window (coming_up or overdue), mirroring how Garage's reminder progress bar (specs/041) only shows
for reminders with enough history to compute a status."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See how close a document is to expiring, as a visual bar (Priority: P2)

An owner looking at the Documents screen wants a quick visual sense of urgency for a document
that's approaching its expiry date, beyond just a text badge.

**Why this priority**: A real but secondary polish item — the text badges already convey the same
underlying fact; this adds a faster-to-scan visual on top.

**Independent Test**: With a document whose expiry date falls within the existing 30-day coming-up
window, view the Documents screen and confirm a progress bar appears on that document's card,
reflecting how much of that window has elapsed.

**Acceptance Scenarios**:

1. **Given** a document whose expiry date is within the existing coming-up window, **When** the
   owner views the Documents screen, **Then** a progress bar appears on that document's card, more
   filled the closer the expiry date is.
2. **Given** an expired document, **When** the owner views its card, **Then** the bar shows as full
   and colored to match the existing expired treatment.
3. **Given** a document whose expiry date is well beyond the coming-up window (on-track), **When**
   the owner views its card, **Then** no progress bar is shown — there is no meaningful "percent
   complete" to show this far out, only a future date.
4. **Given** a document with no expiry date at all, **When** the owner views its card, **Then** no
   progress bar is shown.

---

### Edge Cases

- What happens for a document exactly at its expiry date? → Treated as expired (matching the
  existing `isExpired` boundary already used elsewhere), bar shown full.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Documents screen MUST show a visual progress bar on a document's card whenever
  that document's expiry status is coming-up or expired.
- **FR-002**: The system MUST NOT show a progress bar for a document that is on-track (well before
  its coming-up window) or has no expiry date at all — never a fabricated or meaningless
  percentage.
- **FR-003**: The progress bar's fill MUST be computed server-side, reusing the exact same
  fixed-window logic already used to classify a document's expiry status, guarded the same way that
  logic is already guarded — no new reference date is invented for documents (which have no
  "issued"/"valid-from" field).
- **FR-004**: An expired document's bar MUST render as fully filled, using the same color already
  used elsewhere for expired documents.

### Key Entities

- **Document expiry status (existing, extended)**: gains one new field — the fraction of the
  existing fixed coming-up window that has elapsed, present only when the document's status is
  coming-up or overdue.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can visually distinguish, at a glance, which coming-up documents are closer
  to expiring versus further out, without reading the exact date.
- **SC-002**: Zero documents ever show a fabricated percentage — every on-track or no-expiry-date
  document shows no bar at all.

## Assumptions

- Reuses the existing 30-day coming-up window (already used to classify `reminderStatus`) as the
  bar's fixed denominator — no new "issued"/"valid-from" date is added to the Document entity, since
  none exists today and inventing one would be exactly the kind of guessed data constitution
  Principle IV forbids.
- Out of scope: any change to the coming-up window's length, or to the existing `isExpired`/
  `reminderStatus` classification itself — this only adds a proportional visualization on top of
  logic that already exists.
