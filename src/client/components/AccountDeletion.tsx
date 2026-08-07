import { useState } from "react";
import { REQUIRED_CONFIRMATION_PHRASE } from "../account";
import { t } from "../i18n/strings";

type AccountDeletionProps = {
  onConfirmDelete: () => void;
};

const toggleStyle = {
  background: "transparent",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-md)",
  padding: "6px 10px",
  color: "var(--warn)",
  font: "500 10.5px var(--font-mono)",
  cursor: "pointer",
} as const;

export function AccountDeletion({ onConfirmDelete }: AccountDeletionProps) {
  const [expanded, setExpanded] = useState(false);
  const [typedPhrase, setTypedPhrase] = useState("");

  if (!expanded) {
    return (
      <button type="button" style={toggleStyle} onClick={() => setExpanded(true)}>
        {t("deleteAccountToggle")}
      </button>
    );
  }

  const matches = typedPhrase === REQUIRED_CONFIRMATION_PHRASE;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        border: "1px solid var(--warn)",
        borderRadius: "var(--radius-md)",
        padding: 12,
        maxWidth: 420,
      }}
    >
      <span style={{ font: "500 12px var(--font-ui)", color: "var(--warn)" }}>
        {t("deleteAccountWarning")}
      </span>
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ font: "400 10.5px var(--font-mono)", color: "var(--dim)" }}>
          {t("deleteAccountConfirmPrompt", { phrase: REQUIRED_CONFIRMATION_PHRASE })}
        </span>
        <input
          type="text"
          value={typedPhrase}
          onChange={(event) => setTypedPhrase(event.target.value)}
          style={{
            background: "var(--panel2)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-md)",
            padding: "6px 8px",
            color: "var(--fg)",
            font: "400 12px var(--font-ui)",
            outline: "none",
          }}
        />
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={!matches}
          onClick={onConfirmDelete}
          style={{
            background: matches ? "var(--warn)" : "var(--panel2)",
            border: "1px solid var(--warn)",
            borderRadius: "var(--radius-md)",
            padding: "6px 10px",
            color: matches ? "var(--on-acc)" : "var(--dim)",
            font: "500 10.5px var(--font-mono)",
            cursor: matches ? "pointer" : "not-allowed",
          }}
        >
          {t("deleteAccountConfirmButton")}
        </button>
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setTypedPhrase("");
          }}
          style={{
            background: "transparent",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-md)",
            padding: "6px 10px",
            color: "var(--dim)",
            font: "500 10.5px var(--font-mono)",
            cursor: "pointer",
          }}
        >
          {t("deleteAccountCancel")}
        </button>
      </div>
    </div>
  );
}
