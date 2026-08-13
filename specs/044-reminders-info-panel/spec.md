# Feature Specification: Reminders Screen Info Panel

**Feature Branch**: `044-reminders-info-panel`

**Created**: 2026-08-13

**Status**: Draft

**Input**: User description: "Reminders screen lacks the mockup's explainer/legend panel and
recently-completed history (GitHub issue #141). The design mockup has a persistent right-side panel
next to the reminder groups: a static explanation of how status is calculated, a color-dot legend,
and a recently-completed list of past reminders. The real Reminders screen has none of this. The
legend/explainer text is static content; the recently-completed list should reflect each rule's
last known completion (lastDoneDate), not a full history log the data model doesn't have. Drop the
mockup's OBD-specific wording since this app has no OBD integration."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Understand how reminder status/urgency is determined (Priority: P2)

An owner looking at the Reminders screen sees color-coded status badges but no explanation of what
determines them, and wants to understand the app's own logic without guessing.

**Why this priority**: Pure information/trust feature — helps the owner interpret the screen they're
already looking at, but doesn't change any workflow.

**Independent Test**: View the Reminders screen and confirm a persistent panel explains, in plain
language, that a reminder becomes due by whichever comes first (date or distance), plus a legend
mapping each status color to its meaning.

**Acceptance Scenarios**:

1. **Given** the owner is on the Reminders screen, **When** they look at the panel next to the
   reminder list, **Then** they see a short explanation of the app's actual status logic (date-or-
   distance, whichever comes first) and a legend showing what each status color means.

---

### User Story 2 - See which reminders were most recently completed (Priority: P3)

An owner wants a quick reminder of what they last did, without scrolling through the full reminder
list looking for the most recent `lastDoneDate`.

**Why this priority**: Smaller, secondary convenience on top of the explainer panel — reuses data
already loaded for this screen.

**Independent Test**: With at least one reminder that has been marked done, view the Reminders
screen and confirm the panel lists it under a "recently completed" heading.

**Acceptance Scenarios**:

1. **Given** one or more reminders have a recorded last-done date, **When** the owner views the
   panel, **Then** the most recently completed reminders appear there, most recent first, up to a
   small cap.
2. **Given** no reminder has ever been marked done, **When** the owner views the panel, **Then**
   the recently-completed section shows nothing (or an empty-state), never a fabricated entry.

---

### Edge Cases

- What happens when a reminder has been marked done more than once over time? → Only its single
  most recent completion (`lastDoneDate`) is shown — this app's data model doesn't retain a full
  completion history, only the latest one per reminder, matching what's already stored today.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Reminders screen MUST show a persistent explanatory panel describing, in plain
  language, that a reminder becomes due based on whichever of its configured triggers (elapsed
  time, distance driven) is reached first.
- **FR-002**: The explanatory panel MUST include a legend mapping each of this app's actual
  reminder-status colors to its meaning (overdue, coming up, on track).
- **FR-003**: The explanatory panel MUST NOT reference any capability this app doesn't have (e.g.
  automatic odometer tracking via an external hardware adapter).
- **FR-004**: The panel MUST show a "recently completed" list drawn from reminders that have a
  recorded last-done date, most recent first, capped at a small fixed number.
- **FR-005**: The system MUST NOT show a fabricated or placeholder "recently completed" entry when
  no reminder has ever been marked done — the section is simply empty in that case.

### Key Entities

None — reuses each reminder rule's already-existing `lastDoneDate`; no new field, no new entity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can determine, from the Reminders screen alone, what makes a reminder
  overdue vs. coming up vs. on track, without needing outside documentation.
- **SC-002**: The recently-completed list never shows an entry for a reminder that was never marked
  done.

## Assumptions

- "Recently completed" means sorted by `lastDoneDate` descending, capped (e.g. at 3) — not a
  time-windowed ("within the last N days") filter, since this app's data model only stores each
  reminder's single latest completion, not a full history; a simple "most recent first, capped"
  list is the closest honest match to the mockup's intent without implying more history exists than
  actually does.
- Out of scope: any change to the reminder list itself, the add-reminder form, or the mark-done
  action — this feature only adds a new, separate panel alongside the existing screen content.
