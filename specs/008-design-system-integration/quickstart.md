# Quickstart: Design System Integration

## 1. Run the app locally

```sh
deno task dev
```

## 2. Sign-in screen (User Story 1)

1. Load the app signed out. Confirm the logo mark, product name, and a styled dark-theme sign-in
   screen render — passkey sign up/sign in, magic link, and Google sign-in are each visually
   distinguishable controls, not a flat list of plain buttons/links.
2. Complete a sign-in (e.g. via the dev session helper, or a real passkey/magic-link flow) and
   confirm you land on the styled garage view.

## 3. Garage (User Story 2)

1. With no vehicles yet, confirm a styled empty state invites adding the first vehicle (not a bare
   line of text).
2. Add a vehicle through the styled form; confirm it appears as a styled card immediately, no page
   reload.
3. Add a second vehicle with only the required fields, and a third with every optional field
   (make/model/year/VIN) set; confirm both card variants render cleanly — no blank space or
   literal "null" for the vehicle missing optional fields.

## 4. Service records (User Story 3)

1. Select a vehicle with no service records yet; confirm a styled empty state invites logging the
   first one.
2. Add a service record through the styled form; confirm it appears in the styled history list
   immediately.
3. Upload a small JPEG as an attachment to a record; confirm clear visual success feedback and that
   the attachment is listed against that record afterward.

## 5. Theme toggle (User Story 4)

1. Activate the theme toggle; confirm every visible screen (whichever you're on) switches to the
   light palette with all text remaining legible — no unstyled or illegible elements.
2. Reload the page; confirm the light theme persisted.
3. Toggle back to dark and reload again; confirm dark persisted too.

## 6. Responsive check (Edge Cases / FR-007 / SC-004)

Resize the viewport to 375px wide (or use browser device emulation). Confirm: no horizontal page
scroll, no overlapping controls, every control from steps 2-5 above remains reachable and usable.

## 7. Regression check (FR-003 / SC-002)

Run the full automated suite to confirm no existing behavior changed:

```sh
deno task check
```

Expect all existing tests (auth, vehicles, service records, attachments) to still pass unchanged —
this feature should not have touched any server-side file or any client data-fetching module
(`vehicles.ts`, `service-records.ts`, `auth/*`).
