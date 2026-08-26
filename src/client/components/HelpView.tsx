import { useState } from "react";
import type { DocBlock, DocSection } from "../docs-content";
import { t } from "../i18n/strings";

type HelpViewProps = {
  sections: DocSection[];
  /** Rendered as a small back affordance when provided — used only by the signed-out entry point
   * (LandingPage, specs/057 US2); the signed-in AppShell entry point omits it since the nav rail
   * already handles navigating away. */
  onBack?: () => void;
};

function Block({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case "heading":
      return (
        <div style={{ font: "600 15px var(--font-ui)", letterSpacing: "-.015em" }}>
          {block.text}
        </div>
      );
    case "paragraph":
      return (
        <div
          style={{
            font: "400 13.5px/1.7 var(--font-ui)",
            color: "var(--fg)",
            maxWidth: "64ch",
            textWrap: "pretty",
          }}
        >
          {block.text}
        </div>
      );
    case "list":
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {block.items.map((item, index) => (
            <div
              key={index}
              style={{
                display: "grid",
                gridTemplateColumns: "16px minmax(0,1fr)",
                gap: 9,
                alignItems: "baseline",
                font: "400 13px/1.6 var(--font-ui)",
                maxWidth: "62ch",
              }}
            >
              <span style={{ color: "var(--acc)", font: "500 11px var(--font-mono)" }}>▸</span>
              <span style={{ textWrap: "pretty" }}>
                <b style={{ fontWeight: 600 }}>{item.label}</b>
                {item.text}
              </span>
            </div>
          ))}
        </div>
      );
    case "code":
      return (
        <div
          style={{
            background: "var(--panel2)",
            border: "1px solid var(--line)",
            borderRadius: 9,
            padding: "14px 16px",
            font: "400 11.5px/1.8 var(--font-mono)",
            color: "var(--fg)",
            whiteSpace: "pre-wrap",
            overflowX: "auto",
          }}
        >
          {block.text}
        </div>
      );
    case "note":
      return (
        <div
          style={{
            border: "1px solid var(--acc)",
            borderRadius: 9,
            padding: "13px 15px",
            font: "400 12.5px/1.6 var(--font-ui)",
            color: "var(--fg)",
            maxWidth: "62ch",
            display: "flex",
            gap: 10,
          }}
        >
          <span style={{ color: "var(--acc)", font: "500 11px var(--font-mono)", flex: "none" }}>
            NB
          </span>
          <span style={{ textWrap: "pretty" }}>{block.text}</span>
        </div>
      );
  }
}

// Two-pane documentation viewer (specs/057) — section list + structured content + pagination.
// Shared, as-is, between the signed-in AppShell entry point (App.tsx's `view === "help"` branch)
// and the signed-out LandingPage entry point (research.md Decision 3) — one component, two call
// sites, never two implementations of the same UI.
export function HelpView({ sections, onBack }: HelpViewProps) {
  const [selectedId, setSelectedId] = useState(sections[0]?.id ?? "");
  const index = sections.findIndex((section) => section.id === selectedId);
  const section = sections[index] ?? sections[0];
  const prev = index > 0 ? sections[index - 1] : null;
  const next = index >= 0 && index < sections.length - 1 ? sections[index + 1] : null;

  if (!section) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          style={{
            alignSelf: "flex-start",
            font: "500 11.5px var(--font-ui)",
            color: "var(--dim)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-md)",
            padding: "8px 13px",
            cursor: "pointer",
            background: "transparent",
          }}
        >
          ← {t("helpBackLabel")}
        </button>
      )}

      <div
        className="help-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "212px minmax(0,1fr)",
          gap: 26,
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div
            style={{
              font: "400 9.5px var(--font-mono)",
              color: "var(--dim)",
              letterSpacing: ".1em",
              padding: "0 10px 9px",
            }}
          >
            {t("helpSectionsHeading")}
          </div>
          {sections.map((item) => {
            const active = item.id === section.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "9px 10px",
                  borderRadius: "var(--radius-md)",
                  border: "none",
                  borderLeft: `2px solid ${active ? "var(--acc)" : "transparent"}`,
                  background: active ? "var(--panel2)" : "transparent",
                  font: "500 12px var(--font-ui)",
                  color: active ? "var(--fg)" : "var(--dim)",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ font: "400 9.5px var(--font-mono)", color: "var(--dim)" }}>
                  {item.number}
                </span>
                {item.title}
              </button>
            );
          })}
        </div>

        <div
          style={{
            border: "1px solid var(--line)",
            background: "var(--panel)",
            borderRadius: "var(--radius-lg)",
            padding: "28px 32px",
            maxWidth: 760,
          }}
        >
          <div
            style={{
              font: "400 10px var(--font-mono)",
              color: "var(--acc)",
              letterSpacing: ".12em",
            }}
          >
            {section.kicker}
          </div>
          <div
            style={{
              font: "700 27px/1.15 var(--font-ui)",
              letterSpacing: "-.03em",
              marginTop: 11,
              textWrap: "pretty",
            }}
          >
            {section.title}
          </div>
          <div
            style={{
              font: "400 13.5px/1.65 var(--font-ui)",
              color: "var(--dim)",
              marginTop: 11,
              maxWidth: "60ch",
              textWrap: "pretty",
            }}
          >
            {section.lead}
          </div>
          <div style={{ height: 1, background: "var(--line)", margin: "22px 0" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 17 }}>
            {section.blocks.map((block, blockIndex) => <Block key={blockIndex} block={block} />)}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginTop: 28,
              borderTop: "1px solid var(--line)",
              paddingTop: 17,
            }}
          >
            {prev && (
              <button
                type="button"
                onClick={() => setSelectedId(prev.id)}
                style={{
                  font: "500 11.5px var(--font-ui)",
                  color: "var(--fg)",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--radius-md)",
                  padding: "9px 13px",
                  cursor: "pointer",
                  background: "transparent",
                }}
              >
                {t("helpPrevLabel")}
              </button>
            )}
            {next && (
              <button
                type="button"
                onClick={() => setSelectedId(next.id)}
                style={{
                  marginLeft: "auto",
                  font: "500 11.5px var(--font-ui)",
                  color: "var(--fg)",
                  border: "1px solid var(--line)",
                  borderRadius: "var(--radius-md)",
                  padding: "9px 13px",
                  cursor: "pointer",
                  background: "transparent",
                }}
              >
                {t("helpNextLabel")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
