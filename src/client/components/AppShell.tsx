import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { AlertIcon, DashboardIcon, GarageIcon, SettingsIcon } from "../design/icons";
import { useTheme } from "../theme";
import { t } from "../i18n/strings";
import { APP_VERSION } from "../version";

export type AppView = "garage" | "dashboard" | "review" | "settings";

type AppShellProps = {
  title: string;
  view: AppView;
  onSelectView: (view: AppView) => void;
  /** Shown as a small badge on the "review" nav entry (spec 021 FR-007/FR-008) — omit or 0 for none. */
  reviewBadgeCount?: number;
  children: ReactNode;
};

const NAV_ITEMS: {
  view: AppView;
  icon: typeof GarageIcon;
  labelKey: "garageNavLabel" | "dashboardNavLabel" | "syncReviewNavLabel" | "settingsNavLabel";
}[] = [
  { view: "garage", icon: GarageIcon, labelKey: "garageNavLabel" },
  { view: "dashboard", icon: DashboardIcon, labelKey: "dashboardNavLabel" },
  { view: "review", icon: AlertIcon, labelKey: "syncReviewNavLabel" },
  { view: "settings", icon: SettingsIcon, labelKey: "settingsNavLabel" },
];

// The persistent chrome wrapping every signed-in screen — nav rail + header, ported from
// docs/odograph-design.zip's "Кокпит" mockup. Both nav entries (Garage, Dashboard) are now live —
// spec 014 is the first feature to make the nav rail an actual view switch rather than a single
// decorative entry.
export function AppShell(
  { title, view, onSelectView, reviewBadgeCount = 0, children }: AppShellProps,
) {
  const [, toggleTheme] = useTheme();

  return (
    <div style={{ display: "flex", height: "100vh", minHeight: 560 }}>
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
          <button
            type="button"
            onClick={toggleTheme}
            style={{
              marginLeft: "auto",
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
        </header>

        <main style={{ flex: 1, overflow: "auto", padding: "20px 22px 26px" }}>{children}</main>
      </div>
    </div>
  );
}
