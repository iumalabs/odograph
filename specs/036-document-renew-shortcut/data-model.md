# Phase 1 Data Model: Document Renew Shortcut

No new entity, no schema change, no API change, no new prop. This feature reads two fields the
`VehicleDocument` objects `DocumentPanel.tsx` already receives (`isExpired: boolean`,
`reminderStatus: ReminderStatus`, already used by the existing Expired/Coming-up badges) and writes
through the existing `onUpdateDocument` prop, unchanged.

## Local component state (no new fields beyond what already exists)

`DocumentPanel.tsx` already has `editingId`, `draftTitle`, `draftCategory`, `draftExpiryDate`,
`draftNotes` — all reused as-is. The only new piece is a second entry-point function into that same
state:

| Function | Behavior |
| ---------- | ---------- |
| `startEdit(document)` (existing) | Sets every draft field from `document`'s current values, including `draftExpiryDate = document.expiryDate ?? ""`. |
| `startRenew(document)` (new) | Identical to `startEdit`, except `draftExpiryDate = ""` unconditionally, regardless of `document.expiryDate`. |

Both set `editingId = document.id`, opening the exact same form; `saveEdit` (existing, unchanged)
handles the save for either entry point identically.
