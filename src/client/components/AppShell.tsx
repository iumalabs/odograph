import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { GarageIcon } from "../design/icons";
import { useTheme } from "../theme";

type AppShellProps = {
  title: string;
  children: ReactNode;
};

// The persistent chrome wrapping every signed-in screen — nav rail + header, ported from
// docs/odograph-design.zip's "Кокпит" mockup. Only one nav entry (Garage) exists: no other
// screens are built yet (spec.md Assumptions/FR-008).
export function AppShell({ title, children }: AppShellProps) {
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 5,
            padding: "11px 0",
            width: "100%",
            borderLeft: "2px solid var(--acc)",
            background: "var(--panel2)",
            color: "var(--acc)",
          }}
        >
          <GarageIcon size={18} />
          <span style={{ font: "500 8.5px var(--font-mono)", letterSpacing: ".06em" }}>
            GARAGE
          </span>
        </div>
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
