# Feature Specification: Currency Display Setting

**Feature Branch**: `035-currency-display`

**Created**: 2026-08-12

**Status**: Draft

**Input**: User description: "No currency support anywhere in the app (GitHub issue #120). Add a
global currency display setting — a symbol shown alongside every existing money figure throughout
the app — matching the design prototype's four-currency (USD/EUR/RUB/GBP) toggle. Pure label/display
change, no currency conversion. Client-local preference (mirroring the existing theme setting), no
server sync. Selector lives in the Settings screen. Symbol prefixed onto every cost figure already
shown across the app."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose a currency once, see it everywhere (Priority: P1)

An owner wants to pick which currency symbol represents their money figures throughout the app —
once, from one place — rather than seeing bare unlabeled numbers everywhere costs appear.

**Why this priority**: This is the entire feature. Without the setting, there's nothing for the
display change to key off of.

**Independent Test**: Can be fully tested by opening Settings, choosing a currency, and confirming a
cost figure elsewhere in the app (e.g. a fuel record's cost) now shows that currency's symbol.

**Acceptance Scenarios**:

1. **Given** the Settings screen, **When** the owner selects a currency (USD, EUR, RUB, or GBP),
   **Then** that choice is saved and immediately reflected the next time a cost figure is shown
   anywhere in the app.
2. **Given** an owner who has never chosen a currency, **When** they view any cost figure, **Then**
   it shows the default currency's symbol (USD), not an unlabeled number.
3. **Given** an owner returns to the app in a new browser session (same device), **When** they view
   a cost figure, **Then** their previously chosen currency's symbol is still shown, without
   needing to choose again.

---

### Edge Cases

- What happens on a different device/browser than where the currency was chosen? The default
  (USD) is shown there — this is a per-device preference, not a synced account setting, matching
  how the existing theme preference already behaves.
- What happens to numeric values themselves? They are never altered — this feature only adds a
  currency symbol next to already-computed figures; no conversion, rounding, or recalculation of
  any stored or displayed number.
- What happens on the PDF export? Out of scope for this feature — the exported report continues to
  show bare cost figures as it does today; it has no access to a device-local preference.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Settings screen MUST let the owner choose one of four currencies: USD, EUR, RUB,
  or GBP.
- **FR-002**: The chosen currency MUST persist across page reloads and future visits on the same
  device/browser, without the owner needing to re-select it.
- **FR-003**: Every place a cost figure is already displayed (service record cost, fuel record
  cost, plan card estimated cost, expense breakdown maintenance/fuel/total figures, dashboard
  cost-per-distance and cost-per-time figures) MUST show the chosen currency's symbol alongside the
  number.
- **FR-004**: An owner who has never chosen a currency MUST see cost figures with the default
  currency (USD)'s symbol, not an unlabeled number.
- **FR-005**: The system MUST NOT perform any currency conversion — changing the selected currency
  changes only the displayed symbol, never the underlying numeric value.
- **FR-006**: The chosen currency MUST NOT be synced across devices/browsers or stored on the
  server — it is a per-device preference only.

### Key Entities

- **Currency preference** (new, client-local only): one of four fixed values (USD, EUR, RUB, GBP),
  associated with the browser/device, not with any account, vehicle, or record.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can change which currency symbol is shown throughout the app in a single
  action from the Settings screen.
- **SC-002**: Every cost figure across the app (service records, fuel records, plan cards, expense
  breakdown, dashboard) consistently shows the same chosen currency symbol — none are left
  unlabeled.
- **SC-003**: A returning owner never has to re-choose their currency on the same device.

## Assumptions

- **Global, not per-vehicle**: matches the source design's own behavior — one currency choice
  applies to every vehicle and every cost figure, not a per-vehicle setting (unlike odometer unit,
  which is per-vehicle).
- **No real conversion, ever**: this is a constitution-driven boundary (Principle II: server-
  computed aggregates; Principle IV: no interpolated data) — introducing real exchange-rate
  conversion would require an external, non-authoritative data source this project has no
  dependency on. Out of scope, not deferred.
- **PDF export unaffected**: the server-rendered maintenance-history report has no access to a
  client-local preference and continues to show bare figures; threading a currency choice into that
  export is a separate, larger decision not needed to close this feature's specific gap.
- **Four currencies only**: matches the source design's own fixed list (USD/EUR/RUB/GBP) — not an
  open-ended currency picker.
