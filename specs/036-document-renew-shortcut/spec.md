# Feature Specification: Document Renew Shortcut

**Feature Branch**: `036-document-renew-shortcut`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "No quick-renew shortcut for expired/coming-up documents (GitHub issue
#123). Add a 'Renew' quick-action next to a document already flagged Expired or Coming up, opening
the same edit form the existing Edit button opens but with the expiry-date field starting blank
instead of pre-filled with the stale value — never auto-guessing a new date."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Quickly start renewing a stale document (Priority: P1)

An owner viewing a document that's expired or coming up wants a direct way to enter its new expiry
date, without first having to clear out the old, no-longer-useful date from a generic edit form.

**Why this priority**: This is the entire feature — a single, small friction-reduction on an
already-existing edit flow.

**Independent Test**: Can be fully tested by viewing a document flagged Expired or Coming up,
clicking "Renew", and confirming the edit form opens with every field pre-filled as usual except the
expiry date, which starts empty.

**Acceptance Scenarios**:

1. **Given** a document flagged Expired, **When** the owner clicks "Renew" on it, **Then** its edit
   form opens with the title/category/notes fields pre-filled as they already are today, but the
   expiry-date field empty.
2. **Given** a document flagged Coming up, **When** the owner clicks "Renew" on it, **Then** the
   same behavior applies as Scenario 1.
3. **Given** the Renew form is open with the expiry date left blank, **When** the owner enters a new
   date and saves, **Then** the document's expiry date updates to exactly the date the owner typed —
   never a computed or assumed value.
4. **Given** the Renew form is open, **When** the owner saves without entering a new expiry date,
   **Then** the document's expiry date is cleared to unset (identical to how the existing Edit form
   already behaves when its expiry-date field is left blank) — Renew never blocks saving or forces a
   value.

---

### Edge Cases

- What happens for a document with no expiry concern (not flagged Expired or Coming up)? No Renew
  action appears on its row — only the existing Edit action, unchanged, since there's nothing to
  renew.
- What happens if the owner clicks Renew, then changes their mind? The existing "Cancel" affordance
  already available on the edit form applies unchanged — the document is left exactly as it was.
- What happens to the other fields (title, category, notes) when using Renew instead of Edit? They
  behave identically to the existing Edit flow — pre-filled with current values, editable, saved
  as-is if untouched. Only the expiry-date field's starting value differs between Renew and Edit.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each document row currently flagged Expired or Coming up MUST show a "Renew" action,
  in addition to the existing Edit action.
- **FR-002**: A document row not flagged Expired or Coming up MUST NOT show a Renew action.
- **FR-003**: Clicking Renew MUST open the same edit form the existing Edit action opens, with
  title/category/notes pre-filled from the document's current values, identically to Edit.
- **FR-004**: Clicking Renew MUST leave the expiry-date field empty, regardless of the document's
  current (stale) expiry date.
- **FR-005**: The system MUST NOT compute, guess, or pre-fill any new expiry date on the owner's
  behalf under any circumstance — the saved value is always exactly what the owner typed, or unset
  if they typed nothing.
- **FR-006**: The existing Edit action's behavior (pre-filling the expiry-date field with the
  document's current value) MUST remain unchanged for every document, flagged or not.

### Key Entities

- **Document** (existing entity, no changes): no new attribute, no new relationship — this feature
  only changes which starting value the already-existing expiry-date form field shows, for one
  specific entry point into that already-existing form.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner renewing an expired or coming-up document no longer needs to manually clear
  the old expiry date before entering the new one.
- **SC-002**: No document's expiry date is ever set to a value the owner did not explicitly type.
- **SC-003**: A document with no expiry concern shows no renew-related UI at all.

## Assumptions

- **No new capability, only a friction reduction**: the underlying ability to change a document's
  expiry date already exists via Edit — this feature does not add any new save path, validation
  rule, or entity.
- **Deliberately does not mirror the source mockup's exact interaction**: the mockup's own "Renew"
  logic discards the reminder and shows a follow-up-nudge toast, with no explicit new-date input at
  all — that behavior doesn't fit this app's real data model and would require fabricating or
  silently deferring a real date change, which this project's constitution rules out. This feature
  intentionally implements a different, safe interaction that achieves the same underlying goal
  (reduce friction renewing a stale document) without inventing data.
