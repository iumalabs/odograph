# Quickstart: Document Renew Shortcut

Client-only feature — no API scenarios. Verified via a live walkthrough against `deno task dev`.

## Scenario 1 — Renew appears only on flagged documents

1. Create a document with an expiry date in the past (e.g. yesterday).
2. Create a second document with no expiry date at all.
   **Expected**: the first document's row shows both "Edit" and "Renew"; the second shows only
   "Edit".

## Scenario 2 — Renew opens the form with expiry blank

1. On the expired document from Scenario 1, click "Renew".
   **Expected**: the edit form opens; title/category/notes show the document's current values; the
   expiry-date field is empty (not showing the past date).

## Scenario 3 — Edit still pre-fills the stale date

1. On the same expired document, click "Cancel", then click "Edit" instead.
   **Expected**: the edit form opens with the expiry-date field showing the original (expired)
   date — Edit's existing behavior is unchanged.

## Scenario 4 — saving from Renew sets exactly what was typed

1. Click "Renew" on the expired document again, type a new date, and save.
   **Expected**: the document's badge disappears (assuming the new date isn't itself expired/coming
   up) and the row shows the exact date typed — not a computed or rounded value.

## Scenario 5 — saving from Renew with no date clears it

1. Click "Renew" on a coming-up document, leave the expiry-date field empty, and save.
   **Expected**: the document's expiry date is now unset, and it no longer shows a Coming-up badge
   (matching how the existing Edit form already behaves when its expiry field is left blank).
