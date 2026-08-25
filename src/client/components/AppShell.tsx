import { useState } from "react";
import type { ReactNode } from "react";
import type { Vehicle } from "../vehicles";
import type { Currency } from "../currency";
import { currencySymbol } from "../currency";
import type { DistanceUnit } from "../distance";
import { Logo } from "./Logo";
import {
  AddIcon,
  AlertIcon,
  BellIcon,
  DashboardIcon,
  DocumentIcon,
  FuelIcon,
  GarageIcon,
  PhotoIcon,
  PlannerIcon,
  ServiceIcon,
  SettingsIcon,
} from "../design/icons";
import { useTheme } from "../theme";
import { t } from "../i18n/strings";
import type { StringKey } from "../i18n/strings";
import { APP_VERSION } from "../version";

export type AppView =
  | "garage"
  | "dashboard"
  | "fuel"
  | "service"
  | "photos"
  | "reminders"
  | "planner"
  | "documents"
  | "review"
  | "settings";

type AppShellProps = {
  title: string;
  view: AppView;
  onSelectView: (view: AppView) => void;
  /** Shown as a small badge on the "review" nav entry (spec 021 FR-007/FR-008) — omit or 0 for none. */
  reviewBadgeCount?: number;
  /** Header vehicle switcher (specs/039) — selecting a pill never navigates, distinct from
   * Garage's/SearchBar's select-and-jump-to-Dashboard behavior (specs/038). */
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string) => void;
  /** Transient save-confirmation message (specs/046) — null when nothing to show. */
  toast: string | null;
  /** Shared error banner (issue #179) — rendered here, once, so it's visible regardless of which
   * of the ten `view`s is active; previously duplicated only into the Garage view's own JSX, so
   * every setError() call from any other screen (attachment rejections, VIN lookup failures, ...)
   * had nothing to render it against. null when nothing to show. */
  error: string | null;
  /** Header currency/units quick-toggles (specs/047) — duplicate the same underlying preferences
   * App.tsx already threads elsewhere (currency: specs/035; distanceUnit: specs/047), never a
   * second independent copy of either. */
  currency: Currency;
  onCurrencyChange: (value: Currency) => void;
  distanceUnit: DistanceUnit;
  onDistanceUnitChange: (value: DistanceUnit) => void;
  children: ReactNode;
};

const NAV_ITEMS: {
  view: AppView;
  icon: typeof GarageIcon;
  labelKey:
    | "garageNavLabel"
    | "dashboardNavLabel"
    | "fuelNavLabel"
    | "serviceNavLabel"
    | "photosNavLabel"
    | "remindersNavLabel"
    | "plannerNavLabel"
    | "documentsNavLabel"
    | "syncReviewNavLabel"
    | "settingsNavLabel";
}[] = [
  { view: "garage", icon: GarageIcon, labelKey: "garageNavLabel" },
  { view: "dashboard", icon: DashboardIcon, labelKey: "dashboardNavLabel" },
  { view: "fuel", icon: FuelIcon, labelKey: "fuelNavLabel" },
  { view: "service", icon: ServiceIcon, labelKey: "serviceNavLabel" },
  { view: "photos", icon: PhotoIcon, labelKey: "photosNavLabel" },
  { view: "reminders", icon: BellIcon, labelKey: "remindersNavLabel" },
  { view: "planner", icon: PlannerIcon, labelKey: "plannerNavLabel" },
  { view: "documents", icon: DocumentIcon, labelKey: "documentsNavLabel" },
  { view: "review", icon: AlertIcon, labelKey: "syncReviewNavLabel" },
  { view: "settings", icon: SettingsIcon, labelKey: "settingsNavLabel" },
];

// Header currency dropdown options (specs/047) — duplicates the same four currencies
// SettingsView.tsx's own <select> already offers, both backed by the one useCurrency() instance
// App.tsx holds (research.md: never a second, independently-drifting copy).
const CURRENCY_OPTIONS: { value: Currency; labelKey: StringKey }[] = [
  { value: "USD", labelKey: "currencyUsdLabel" },
  { value: "EUR", labelKey: "currencyEurLabel" },
  { value: "KGS", labelKey: "currencyKgsLabel" },
  { value: "GBP", labelKey: "currencyGbpLabel" },
];

// The persistent chrome wrapping every signed-in screen — nav rail + header, ported from
// docs/odograph-design.zip's "Кокпит" mockup. Both nav entries (Garage, Dashboard) are now live —
// spec 014 is the first feature to make the nav rail an actual view switch rather than a single
// decorative entry.
export function AppShell(
  {
    title,
    view,
    onSelectView,
    reviewBadgeCount = 0,
    vehicles,
    selectedVehicleId,
    onSelectVehicle,
    toast,
    error,
    currency,
    onCurrencyChange,
    distanceUnit,
    onDistanceUnitChange,
    children,
  }: AppShellProps,
) {
  const [, toggleTheme] = useTheme();
  const [currencyOpen, setCurrencyOpen] = useState(false);

  return (
    <div
      className="app-shell"
      style={{ display: "flex", height: "100vh", minHeight: 560, position: "relative" }}
    >
      <nav
        className="app-nav"
        style={{
          width: 76,
          flex: "none",
          borderRight: "1px solid var(--line)",
          background: "var(--panel)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "16px 0",
          gap: 20,
        }}
      >
        <span className="app-nav-logo">
          <Logo size={34} />
        </span>
        <span
          className="app-nav-version"
          style={{
            font: "500 8.5px var(--font-mono)",
            color: "var(--dim)",
            letterSpacing: ".04em",
            marginTop: -12,
          }}
        >
          v{APP_VERSION}
        </span>
        {NAV_ITEMS.map(({ view: itemView, icon: Icon, labelKey }) => {
          const isActive = view === itemView;
          return (
            <button
              key={itemView}
              type="button"
              className="app-nav-item"
              onClick={() => onSelectView(itemView)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 5,
                padding: "11px 0",
                width: "100%",
                border: "none",
                borderLeft: `2px solid ${isActive ? "var(--acc)" : "transparent"}`,
                background: isActive ? "var(--panel2)" : "transparent",
                color: isActive ? "var(--acc)" : "var(--dim)",
                cursor: "pointer",
              }}
            >
              <span style={{ position: "relative" }}>
                <Icon size={18} />
                {itemView === "review" && reviewBadgeCount > 0 && (
                  <span
                    style={{
                      position: "absolute",
                      top: -4,
                      right: -8,
                      minWidth: 14,
                      height: 14,
                      borderRadius: 7,
                      background: "var(--warn)",
                      color: "var(--on-acc)",
                      font: "600 8.5px var(--font-mono)",
                      display: "grid",
                      placeItems: "center",
                      padding: "0 3px",
                    }}
                  >
                    {reviewBadgeCount}
                  </span>
                )}
              </span>
              <span
                className="app-nav-item-label"
                style={{ font: "500 8.5px var(--font-mono)", letterSpacing: ".06em" }}
              >
                {t(labelKey)}
              </span>
            </button>
          );
        })}
      </nav>

      <div
        className="app-main-wrap"
        style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}
      >
        <header
          className="app-header"
          style={{
            height: 62,
            flex: "none",
            borderBottom: "1px solid var(--line)",
            background: "var(--panel)",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "0 22px",
          }}
        >
          <div
            className="app-header-title"
            style={{ font: "600 14px var(--font-ui)", letterSpacing: "-.01em" }}
          >
            {title}
          </div>

          {vehicles.length > 0 && (
            <div
              className="app-header-vehicle-pills"
              style={{
                display: "flex",
                gap: 6,
                overflowX: "auto",
                maxWidth: 320,
              }}
            >
              {vehicles.map((vehicle) => {
                const isSelected = vehicle.id === selectedVehicleId;
                return (
                  <button
                    key={vehicle.id}
                    type="button"
                    onClick={() => onSelectVehicle(vehicle.id)}
                    style={{
                      flex: "none",
                      maxWidth: 110,
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      font: "500 10.5px var(--font-mono)",
                      border: `1px solid ${isSelected ? "var(--acc)" : "var(--line)"}`,
                      color: isSelected ? "var(--on-acc)" : "var(--dim)",
                      background: isSelected ? "var(--acc)" : "transparent",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 10px",
                      cursor: "pointer",
                    }}
                  >
                    {vehicle.name}
                  </button>
                );
              })}
            </div>
          )}

          <div
            className="app-header-controls"
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flex: "none",
            }}
          >
            <button
              type="button"
              onClick={() => onDistanceUnitChange(distanceUnit === "km" ? "mi" : "km")}
              style={{
                font: "500 10.5px var(--font-mono)",
                color: "var(--dim)",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-sm)",
                padding: "6px 10px",
                cursor: "pointer",
                background: "transparent",
              }}
            >
              {distanceUnit}
            </button>

            <div style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setCurrencyOpen((open) => !open)}
                style={{
                  font: "500 10.5px var(--font-mono)",
                  color: "var(--dim)",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--radius-sm)",
                  padding: "6px 10px",
                  cursor: "pointer",
                  background: "transparent",
                }}
              >
                {currencySymbol(currency)} {currency}
              </button>
              {currencyOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: 36,
                    right: 0,
                    zIndex: 20,
                    background: "var(--panel2)",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--radius-md)",
                    padding: 5,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    minWidth: 132,
                    boxShadow: "0 12px 30px rgba(0,0,0,.45)",
                    animation: "tin .14s ease",
                  }}
                >
                  {CURRENCY_OPTIONS.map((option) => {
                    const isSelected = option.value === currency;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          onCurrencyChange(option.value);
                          setCurrencyOpen(false);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 9,
                          padding: "8px 9px",
                          borderRadius: "var(--radius-sm)",
                          border: "none",
                          cursor: "pointer",
                          font: "500 11px var(--font-mono)",
                          color: isSelected ? "var(--on-acc)" : "var(--fg)",
                          background: isSelected ? "var(--acc)" : "transparent",
                          textAlign: "left",
                        }}
                      >
                        <span style={{ width: 14, textAlign: "center", fontSize: 12 }}>
                          {currencySymbol(option.value)}
                        </span>
                        {t(option.labelKey)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ width: 1, height: 22, background: "var(--line)", margin: "0 3px" }} />

            <button
              type="button"
              onClick={() => onSelectView("fuel")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "var(--acc)",
                color: "var(--on-acc)",
                border: "1px solid var(--acc)",
                borderRadius: "var(--radius-md)",
                padding: "8px 12px",
                font: "600 11px var(--font-ui)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <AddIcon size={14} />
              {t("quickFuelLabel")}
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              style={{
                width: 32,
                height: 32,
                display: "grid",
                placeItems: "center",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-md)",
                background: "transparent",
                cursor: "pointer",
                fontSize: 14,
                color: "var(--dim)",
              }}
            >
              ◐
            </button>
          </div>
        </header>

        {error !== null && (
          <p
            role="alert"
            style={{
              margin: 0,
              padding: "10px 22px",
              borderBottom: "1px solid var(--line)",
              background: "var(--panel)",
              color: "var(--warn)",
              font: "400 12.5px var(--font-ui)",
            }}
          >
            {error}
          </p>
        )}

        <main className="app-main" style={{ flex: 1, overflow: "auto", padding: "20px 22px 26px" }}>
          <div
            className="app-main-content"
            style={{ width: "100%", maxWidth: 1180, margin: "0 auto" }}
          >
            {children}
          </div>
        </main>
      </div>

      {toast !== null && (
        <div
          className="app-toast"
          style={{
            position: "absolute",
            right: 22,
            bottom: 22,
            zIndex: 40,
            background: "var(--acc)",
            color: "var(--on-acc)",
            borderRadius: "var(--radius-lg)",
            padding: "13px 17px",
            font: "600 12.5px var(--font-ui)",
            boxShadow: "0 14px 34px rgba(0,0,0,.5)",
            animation: "tin .18s ease",
            maxWidth: 360,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
