import type { ReactNode } from "react";
import type { Vehicle } from "../vehicles";
import { Logo } from "./Logo";
import {
  AddIcon,
  AlertIcon,
  BellIcon,
  DashboardIcon,
  DocumentIcon,
  FuelIcon,
  GarageIcon,
  PlannerIcon,
  ServiceIcon,
  SettingsIcon,
} from "../design/icons";
import { useTheme } from "../theme";
import { t } from "../i18n/strings";
import { APP_VERSION } from "../version";

export type AppView =
  | "garage"
  | "dashboard"
  | "fuel"
  | "service"
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
  { view: "reminders", icon: BellIcon, labelKey: "remindersNavLabel" },
  { view: "planner", icon: PlannerIcon, labelKey: "plannerNavLabel" },
  { view: "documents", icon: DocumentIcon, labelKey: "documentsNavLabel" },
  { view: "review", icon: AlertIcon, labelKey: "syncReviewNavLabel" },
  { view: "settings", icon: SettingsIcon, labelKey: "settingsNavLabel" },
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
    children,
  }: AppShellProps,
) {
  const [, toggleTheme] = useTheme();

  return (
    <div style={{ display: "flex", height: "100vh", minHeight: 560, position: "relative" }}>
      <nav
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
        <Logo size={34} />
        <span
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
              <span style={{ font: "500 8.5px var(--font-mono)", letterSpacing: ".06em" }}>
                {t(labelKey)}
              </span>
            </button>
          );
        })}
      </nav>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <header
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
          <div style={{ font: "600 14px var(--font-ui)", letterSpacing: "-.01em" }}>{title}</div>

          {vehicles.length > 0 && (
            <div
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

        <main style={{ flex: 1, overflow: "auto", padding: "20px 22px 26px" }}>{children}</main>
      </div>

      {toast !== null && (
        <div
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
