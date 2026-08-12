# Tasks: Top-Level Nav Screens

**Input**: Design documents from `/specs/038-top-level-nav-screens/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: No client-side test suite exists in this project for component-level UI — verified
manually via quickstart.md against `deno task dev`, matching specs/033-037. This feature touches
zero server files, so no server test coverage applies either.

## Phase 1: Setup

None — no new dependency.

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] TN-001 [P] `src/client/design/icons.tsx`: add `PlannerIcon` and `DocumentIcon`, SVG path data
      ported verbatim from the mockup's nav markup (research.md), matching this file's existing
      `commonProps` convention
- [X] TN-002 [P] `src/client/i18n/strings.ts`: add `fuelNavLabel`, `serviceNavLabel`,
      `remindersNavLabel`, `plannerNavLabel`, `documentsNavLabel` near the existing
      `garageNavLabel`/`dashboardNavLabel` keys; add one shared `selectVehiclePrompt: "Select a
      vehicle from the Garage to see this screen."` (data-model.md/research.md — Dashboard's
      existing spec-037 string is left untouched)
- [X] TN-003 `src/client/components/AppShell.tsx`: extend the `AppView` union and `NAV_ITEMS` per
      data-model.md (5 new entries between `dashboard` and `review`, using TN-001's new icons plus
      the existing `BellIcon`/`FuelIcon`/`ServiceIcon` for the entries that already have a matching
      icon); widen the `NAV_ITEMS` array's `labelKey` type union to include the 5 new keys

**Checkpoint**: `deno task typecheck` passes; the nav rail renders all 9 icons; nothing routes to
the new views yet (`App.tsx` doesn't handle them).

---

## Phase 3: User Story 1 - Reach fuel/service/reminders/planner/documents from the nav rail (Priority: P1)

**Goal**: Five new `App.tsx` view branches, each rendering its panel verbatim for the selected
vehicle, with a "select a vehicle" guard when none is selected (User Story 3 is satisfied here, by
construction, per every branch below — not a separate task).

- [X] TN-004 [US1] `src/client/App.tsx`: add `if (view === "fuel")` branch — `<AppShell
      title={t("fuelRecordsHeading")} ...>`; if `!selectedVehicleId`, render the shared
      `selectVehiclePrompt` empty-state block (matching the visual pattern already established in
      `DashboardView.tsx`'s own prompt, spec 037); else render `<FuelRecordPanel>` with its exact
      existing props/handlers, moved verbatim from the old Garage-block JSX (no `<h2>` needed — the
      heading now lives in `AppShell`'s header bar)
- [X] TN-005 [US1] `src/client/App.tsx`: add `if (view === "service")` branch — same pattern as
      TN-004, using `t("serviceRecordsHeading")` and `<ServiceRecordPanel>`'s exact existing props
- [X] TN-006 [US1] `src/client/App.tsx`: add `if (view === "reminders")` branch — same pattern,
      using `t("reminderRulesHeading")` and `<ReminderRulePanel>`'s exact existing props
- [X] TN-007 [US1] `src/client/App.tsx`: add `if (view === "planner")` branch — same pattern, using
      `t("planBoardHeading")` and `<PlanBoard>`'s exact existing props
- [X] TN-008 [US1] `src/client/App.tsx`: add `if (view === "documents")` branch — same pattern,
      using `t("documentsHeading")` and `<DocumentPanel>`'s exact existing props

**Checkpoint**: Selecting a vehicle and visiting each of the five new nav icons shows that vehicle's
data with every existing capability intact; visiting any of them with no vehicle selected shows the
shared prompt.

---

## Phase 4: User Story 2 - Garage becomes a vehicle list only (Priority: P1)

**Goal**: Garage shows only the vehicle list; selecting a vehicle (via card click or search)
navigates to Dashboard; Dashboard gains the expense-breakdown table and PDF link.

- [X] TN-009 [US2] `src/client/App.tsx`: remove the entire `{selectedVehicleId && (...)}` block from
      the Garage-view branch (the six `<h2>`+panel pairs: Service, Fuel, Reminders, Documents,
      Planner, Expense breakdown+PDF link) — their content moves to TN-004 through TN-008 and TN-010
- [X] TN-010 [US2] `src/client/App.tsx`: in the `if (view === "dashboard")` branch, after
      `<DashboardView>`, add the `expenseBreakdownHeading` heading + `<ExpenseBreakdownPanel>` and
      the PDF `downloadReportLabel` link, moved verbatim from the removed Garage block (spec.md
      Assumptions)
- [X] TN-011 [US2] `src/client/App.tsx`: change `<Garage>`'s `onSelectVehicle` handler from
      `(id) => setSelectedVehicleId(selectedVehicleId === id ? null : id)` to `(id) => {
      setSelectedVehicleId(id); setView("dashboard"); }` (research.md — no more toggle, select and
      navigate); apply the same change to `<SearchBar>`'s `onSelectVehicle` handler (research.md's
      extended decision — the only other vehicle-selection entry point)

**Checkpoint**: Garage shows only the vehicle list + add-vehicle form; clicking a card or a search
result navigates to Dashboard for that vehicle; Dashboard shows the expense breakdown table and PDF
link below its existing spec-037 content.

## Phase 5: Polish & Cross-Cutting

- [X] TN-012 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [X] TN-013 Walk through quickstart.md's seven scenarios end to end against `deno task dev`,
      paying particular attention to SC-003 (every capability each moved panel had — attachment
      upload, dismiss-duplicate, mark-done, advance-stage, renew — verified individually, not just
      "the screen renders")

## Dependencies

- **Phase 2 (Foundational)** → **all user story phases**: strict — the nav items/icons/labels must
  exist before any view branch can compile against them.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: soft — TN-009 (removing the old Garage
  block) is safe once TN-004 through TN-008 have already relocated that content elsewhere; doing
  TN-009 first would temporarily lose functionality mid-implementation, so Phase 3 before Phase 4 is
  the correct order even though nothing strictly blocks compilation either way.
- **Phase 5 (Polish)**: after everything else.

## Implementation strategy

**MVP = all of Phase 2 + Phase 3 + Phase 4** — this feature has no smaller valid increment than "all
five screens exist AND Garage no longer duplicates them," per spec.md's own framing of User Story 1
and User Story 2 as equal priority (P1). Shipping only Phase 3 without Phase 4 would leave every
panel duplicated in two places, which spec.md explicitly frames as worse than either layout alone.
