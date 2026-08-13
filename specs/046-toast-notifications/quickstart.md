# Quickstart: Toast Save Confirmations

Client-only feature — no API scenarios. Verified via a live walkthrough against `deno task dev`.

## Scenario 1 — confirmation on each covered add action

1. Add a vehicle, then (with it selected) a fuel record, a service record, a reminder, a plan
   card, and a document, one at a time.
   **Expected**: each save shows a brief, bottom-right confirmation message that disappears on its
   own after a few seconds, worded appropriately for what was just added.

## Scenario 2 — rapid saves don't stack

1. Add two fuel records in quick succession (before the first confirmation has disappeared).
   **Expected**: only one confirmation is visible at a time — it reflects the second save, not a
   pile-up of both.

## Scenario 3 — no toast on failure

1. Trigger a failed save (e.g. an invalid vehicle name causing a 400 — reuse the existing error
   banner's own conditions).
   **Expected**: the existing error banner appears; no toast is shown for that attempt.

## Regression check

Confirm edits, deletes, mark-done, and dismiss-duplicate actions are unaffected — no toast fires
for any of them, since those `handle(...)` calls don't pass a `successMessage` (spec.md FR-004).
