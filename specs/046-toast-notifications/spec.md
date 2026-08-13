# Feature Specification: Toast Save Confirmations

**Feature Branch**: `046-toast-notifications`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "No toast/snackbar feedback system anywhere in the app (GitHub issue
#137). The design mockup shows a transient toast notification (bottom-right, accent-colored,
auto-dismiss animation) after actions like saving a record. The real app has zero toast
infrastructure. Scoped to the app's 'create' actions (add vehicle, add fuel record, add service
record, add reminder, add plan card, add document) — the ones a user repeats often and currently get
no explicit confirmation beyond the form clearing itself. Not scoped to updates/deletes/dismissals,
which already have visible feedback (the item disappearing or changing in its list). Errors already
have their own separate, existing inline banner — toasts are additive positive confirmation only,
not a replacement for that."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Get a brief confirmation after adding a record (Priority: P1)

An owner adds a fuel record, service record, reminder, plan card, document, or vehicle, and wants a
clear, brief confirmation that it saved — beyond just noticing the form cleared or a new row
appeared.

**Why this priority**: This is the entire feature — closing a real, repeatedly-noticed feedback gap
identified in the design-vs-built audit.

**Independent Test**: Add a fuel record and confirm a brief, auto-dismissing confirmation message
appears, distinct from the permanent page content.

**Acceptance Scenarios**:

1. **Given** the owner successfully adds a record of any of the six covered types, **When** the
   save completes, **Then** a transient confirmation message appears, then disappears on its own
   after a short delay.
2. **Given** the owner adds a second record shortly after the first, **When** the second save
   completes while the first confirmation is still visible, **Then** the message updates to reflect
   the new save rather than stacking or getting confused between the two.
3. **Given** a save fails, **When** the existing error banner already shown for that case appears,
   **Then** no confirmation toast appears for that failed attempt — a toast only ever follows a
   real success.

---

### Edge Cases

- What happens if the owner navigates to a different screen while a confirmation is still visible?
  → Out of scope to specify precisely; the confirmation is allowed to disappear with the screen
  change, since it's describing an action that already completed regardless of what's shown next.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST show a brief, transient confirmation message after successfully
  adding a vehicle, fuel record, service record, reminder, plan card, or document.
- **FR-002**: The confirmation MUST disappear on its own after a short delay, without requiring the
  owner to dismiss it.
- **FR-003**: The system MUST NOT show a confirmation for a save that fails — the existing error
  banner remains the only feedback for failures.
- **FR-004**: The confirmation MUST NOT be shown for actions other than the six covered "add"
  actions (e.g. edits, deletes, mark-done, dismiss-duplicate already have their own visible
  feedback via the list updating).
- **FR-005**: If a new confirmation is triggered while a previous one is still visible, the display
  MUST reflect only the newest one, never an overlapping stack of messages.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every one of the six covered "add" actions produces a visible, self-clearing
  confirmation on success, with zero missed cases.
- **SC-002**: No confirmation is ever shown for a failed save.

## Assumptions

- Scoped to the six "create" actions named above — not a generic, opt-in-per-call-site
  notification system for every possible mutation in the app. Broader coverage (edits, deletes,
  etc.) can be added later if it turns out to be wanted, but isn't part of this feature.
- "Brief delay" and exact visual treatment (position, color, animation) are implementation details
  left to `/speckit-plan`, informed by the source design mockup and this app's existing visual
  conventions.
