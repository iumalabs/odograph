# Quickstart: Reminders Screen Info Panel

Client-only feature — no API scenarios. Verified via a live walkthrough against `deno task dev`.

## Scenario 1 — explainer + legend always visible

1. View the Reminders screen for any vehicle (with or without reminders).
   **Expected**: a right-side panel shows the explainer paragraph and a 3-color legend
   (overdue/coming-up/on-track), regardless of how many reminders exist.

## Scenario 2 — recently completed, populated

1. Mark at least one reminder done.
2. View the Reminders screen.
   **Expected**: the panel's "recently completed" section lists it.

## Scenario 3 — recently completed, empty

1. View the Reminders screen for a vehicle where no reminder has ever been marked done.
   **Expected**: the recently-completed section shows nothing fabricated — an empty state, not a
   guessed entry.

## Scenario 4 — cap and ordering

1. Mark more than 3 reminders done, at different times.
   **Expected**: only the 3 most recently completed appear, most recent first.

## Regression check

Confirm the reminder list itself, the add-reminder form, and the mark-done/delete actions are
visually and functionally unchanged — this feature only adds a new panel alongside them.
