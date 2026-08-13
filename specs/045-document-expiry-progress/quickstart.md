# Quickstart: Document Expiry Progress Bar

## API scenarios (curl against `deno task dev`)

1. **On-track** — a document with `expiryDate` far in the future → `reminderStatus: "on_track"`,
   `windowFraction: null`.
2. **Coming-up** — a document with `expiryDate` within 30 days → `reminderStatus: "coming_up"`,
   `windowFraction` a value between 0 and 1.
3. **Overdue/expired** — a document with `expiryDate` in the past → `reminderStatus: "overdue"`,
   `isExpired: true`, `windowFraction: 1` (clamped).
4. **No expiry date** — a document with `expiryDate: null` → `reminderStatus: null`,
   `windowFraction: null`.

## Client walkthrough (manual, against `deno task dev`)

1. Open the Documents screen for a vehicle with a coming-up document.
   **Expected**: a progress bar appears on that card.
2. Open it for a vehicle with an on-track (far-future) document.
   **Expected**: no progress bar.
3. Open it for an expired document.
   **Expected**: a full bar, colored to match the existing expired treatment.

## Regression check

Confirm the existing `isExpired`/`reminderStatus` text badges are unchanged in appearance and
behavior — this feature only adds a bar alongside them.
