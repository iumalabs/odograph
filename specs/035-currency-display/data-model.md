# Phase 1 Data Model: Currency Display Setting

No server-side entity, no schema change, no API change. One new client-local value.

## `Currency` (new, client-only)

| Value | Symbol | Label (i18n) |
| ----- | ------ | -------------- |
| `"USD"` | `$` | "US Dollar" |
| `"EUR"` | `€` | "Euro" |
| `"RUB"` | `₽` | "Russian Ruble" |
| `"GBP"` | `£` | "British Pound" |

Stored under `localStorage` key `odograph:currency` (mirrors `theme.ts`'s `odograph:theme` key
convention exactly). Default `"USD"` when unset or the stored value isn't one of the four valid
values (defensive parse, same pattern `theme.ts` already uses for its own stored value).

## Component prop additions (no new types beyond `Currency` itself)

| Component | New prop(s) |
| ----------- | ------------- |
| `SettingsView` | `currency: Currency`, `onCurrencyChange: (value: Currency) => void` |
| `DashboardView` | `currencySymbol: string` |
| `ServiceRecordPanel` | `currencySymbol: string` |
| `FuelRecordPanel` | `currencySymbol: string` |
| `PlanBoard` | `currencySymbol: string` |
| `ExpenseBreakdownPanel` | `currencySymbol: string` |

`App.tsx` is the sole call site of `useCurrency()`; every prop above is derived from that one
instance.
