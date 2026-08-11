# Quickstart: Dedicated Settings Screen

## Prerequisites

- `deno task migrate:local` has been run at least once against this worktree's local D1.
- `deno task dev` running (client + Worker).
- A signed-in dev session (e.g. via `POST /api/v1/_dev/session`, or through the normal
  passkey/magic-link/Google sign-in flow).

## Validation scenario 1 — Settings is reachable and garage is decluttered

1. Open the app, sign in, land on the Garage screen.
2. Confirm the garage screen's account-controls row shows only: signed-in-as text, sync status,
   "add another passkey", "link Google account", magic-link input — and does **not** show API
   token management, push-notification opt-in, or account deletion (spec.md FR-003, FR-004).
3. Click the new "Settings" nav-rail entry (fourth icon, below Garage/Dashboard/Review).
4. Confirm a dedicated Settings screen opens showing API token management, push-notification
   opt-in, and account deletion, and nothing else (FR-001, FR-002).

## Validation scenario 2 — API tokens work identically from Settings

1. On the Settings screen, expand API token management.
2. Create a token with a label and a scope; confirm the one-time secret reveal panel appears with
   working copy/done controls.
3. Confirm the new token appears in the list with correct label, scope, created date, and
   "never used" last-used state.
4. Revoke the token; confirm it shows a "Revoked" badge and is removed from active use (FR-005).

## Validation scenario 3 — Push notifications and account deletion work identically from Settings

1. On the Settings screen, toggle push notifications on; confirm the status label flips to
   "enabled" (or the browser's permission-denied/unsupported state is shown correctly, if
   applicable to the test browser) (FR-006).
2. Expand account deletion; type an incorrect phrase and confirm the delete button stays disabled.
3. Type the exact required confirmation phrase; confirm the delete button becomes enabled; click
   Cancel and confirm no deletion request was sent (FR-007).

## Validation scenario 4 — Navigation doesn't disturb other screen state

1. On the Garage screen, select a vehicle.
2. Navigate to Settings, then back to Garage.
3. Confirm the same vehicle is still selected (FR-009, SC-003).
