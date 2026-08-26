# Quickstart: RU/EN Language Toggle

**Prerequisites**: `deno task dev` running locally; a browser tab open on the landing page.

## Setup

```sh
deno task dev
```

Open the printed local URL. Optionally sign in first to reach the authenticated app shell.

## Validation scenarios

1. **Landing page toggle switches visible copy** — On the landing page, locate the `EN / RU`
   control in the header. Click it. Confirm the headline, lead copy, and sign-in card switch
   to Russian immediately, with no page reload (watch the browser's network panel — no
   navigation/document request fires).
2. **Toggle back** — Click the control again. Confirm everything reverts to English
   immediately.
3. **Persistence across reload** — With Russian selected, reload the page (`Cmd/Ctrl+R`).
   Confirm the page still renders in Russian on load (no English flash).
4. **Persistence across a new session** — With Russian selected, open the app in a fresh tab
   (same browser, same `localStorage`). Confirm it opens already in Russian.
5. **Authenticated app shell toggle** — Sign in. Locate the `EN / RU` control in the app
   shell's header. Click it. Confirm the nav rail labels and the current screen's visible text
   switch language immediately.
6. **Switching across multiple screens** — While signed in and in Russian, navigate to at
   least 3 different screens (e.g. Dashboard, a vehicle's Fuel Records, Settings). Confirm each
   renders fully in Russian — no screen silently still shows English strings (SC-001).
7. **Independence from other preferences** — Toggle language to Russian, then check the
   existing theme toggle, currency, and distance-unit settings are unchanged (still whatever
   they were before) — and vice versa, toggling theme doesn't change language (FR-005,
   Principle IX).
8. **Data entered by the user is unaffected** — Add or view a vehicle/service record with a
   user-typed name or note. Confirm that text renders exactly as typed regardless of the
   selected interface language (spec.md Edge Cases).

## Automated check

```sh
deno task test
```

`tests/client/i18n.test.ts` asserts `ru` has an exact key-for-key match with `en` (catches any
silently untranslated string) and that every `{param}`-templated key has matching placeholder
names in both locales.

## Full verification

```sh
deno task check
```

fmt, lint, typecheck, full test suite, build — must all pass before opening a PR.
