# Quickstart: Lazy-Load Non-Initial Views

## Prerequisites

- `deno task build` run once to produce a real production bundle (the dev server's Vite
  transforms aren't representative of chunking — verify against `dist/client/`).
- A local static server (or `deno task dev`, which will show the same navigation behavior even
  though its dev-mode module graph doesn't chunk the same way as the production build).

## Scenario 1: fewer bytes before first paint

1. `deno task build`.
2. Inspect `dist/client/assets/*.js` — confirm there are now multiple JS chunks instead of one
   `index-*.js` containing everything (compare file count/names against this feature's baseline of
   a single ~335KB bundle).
3. Confirm the chunk containing `AuthScreen`/`Garage`/`SearchBar` (the initial screens) is present,
   and that `DashboardView`, `FuelRecordPanel`, `ServiceRecordPanel`, `ReminderRulePanel`,
   `PlanBoard`, `DocumentPanel`, `SyncReviewScreen`, `SettingsView`, `ExpenseBreakdownPanel` each
   live in separate chunk(s) not required by the initial HTML/entry chunk.

## Scenario 2: every view still works, loads once per session

1. Sign in (fresh session, empty cache ideally — a private/incognito window against the built
   output, or clear the browser cache).
2. Confirm the initial screen (Garage) renders immediately, no visible loading flash.
3. Navigate to each of: Dashboard, Fuel records, Service records, Reminders, Documents, Planner,
   Settings, and the sync-review screen (via the header's review badge, if any pending/rejected
   offline actions exist, or by triggering one).
4. On each view's *first* visit this session, confirm a brief loading indicator appears then the
   view renders normally with correct data — identical to this feature's pre-change behavior.
5. Navigate away and back to an already-visited view — confirm no loading indicator reappears
   (FR-002).
6. Confirm every view's actual functionality (adding a record, editing, etc.) still works
   end-to-end — this feature must not change any view's behavior, only its load timing.

## Scenario 3: chunk-load failure shows a recoverable error, not a blank page

1. With the production build served, open dev tools' network panel and simulate a failure for one
   view's chunk (e.g. block the request or throttle to offline right as you navigate to a
   not-yet-loaded view).
2. Confirm that view's content area shows a clear error state with a retry action, while the
   header/nav/vehicle picker remain fully functional (FR-006) — the rest of the app is unaffected.
3. Restore the network and retry — confirm the view then loads normally.
