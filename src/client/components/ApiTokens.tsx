import { useEffect, useState } from "react";
import { createApiToken, listApiTokens, revokeApiToken } from "../api-tokens";
import type { ApiToken } from "../api-tokens";
import { t } from "../i18n/strings";

type ApiTokensProps = {
  onError: () => void;
};

const toggleStyle = {
  background: "transparent",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-md)",
  padding: "6px 10px",
  color: "var(--dim)",
  font: "500 10.5px var(--font-mono)",
  cursor: "pointer",
} as const;

const inputStyle = {
  background: "var(--panel2)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-md)",
  padding: "6px 8px",
  color: "var(--fg)",
  font: "400 12px var(--font-ui)",
  outline: "none",
} as const;

const buttonStyle = {
  background: "transparent",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-md)",
  padding: "6px 10px",
  color: "var(--dim)",
  font: "500 10.5px var(--font-mono)",
  cursor: "pointer",
} as const;

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export function ApiTokens({ onError }: ApiTokensProps) {
  const [expanded, setExpanded] = useState(false);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [label, setLabel] = useState("");
  const [scope, setScope] = useState<"read" | "write">("read");
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    listApiTokens().then(setTokens).catch(onError);
  }, [expanded]);

  async function handleCreate() {
    try {
      const created = await createApiToken(label, scope);
      setJustCreated(created.token);
      setCopied(false);
      setLabel("");
      setTokens((current) => [...current, created]);
    } catch {
      onError();
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeApiToken(id);
      const refreshed = await listApiTokens();
      setTokens(refreshed);
    } catch {
      onError();
    }
  }

  if (!expanded) {
    return (
      <button type="button" style={toggleStyle} onClick={() => setExpanded(true)}>
        {t("apiTokensToggle")}
      </button>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-md)",
        padding: 12,
        maxWidth: 480,
      }}
    >
      <span style={{ font: "400 11.5px var(--font-ui)", color: "var(--dim)" }}>
        {t("apiTokensIntro")}
      </span>

      {justCreated
        ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              border: "1px solid var(--acc)",
              borderRadius: "var(--radius-md)",
              padding: 10,
            }}
          >
            <span style={{ font: "500 11px var(--font-mono)", color: "var(--acc)" }}>
              {t("apiTokenCreatedWarning")}
            </span>
            <code
              style={{
                font: "400 11px var(--font-mono)",
                color: "var(--fg)",
                wordBreak: "break-all",
              }}
            >
              {justCreated}
            </code>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                style={buttonStyle}
                onClick={() => {
                  navigator.clipboard.writeText(justCreated).catch(() => {});
                  setCopied(true);
                }}
              >
                {copied ? t("apiTokenCreatedCopied") : t("apiTokenCreatedCopy")}
              </button>
              <button type="button" style={buttonStyle} onClick={() => setJustCreated(null)}>
                {t("apiTokenCreatedDone")}
              </button>
            </div>
          </div>
        )
        : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ font: "400 10.5px var(--font-mono)", color: "var(--dim)" }}>
                {t("apiTokenLabelLabel")}
              </span>
              <input
                type="text"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ font: "400 10.5px var(--font-mono)", color: "var(--dim)" }}>
                {t("apiTokenScopeLabel")}
              </span>
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value as "read" | "write")}
                style={inputStyle}
              >
                <option value="read">{t("apiTokenScopeRead")}</option>
                <option value="write">{t("apiTokenScopeWrite")}</option>
              </select>
            </label>
            <button
              type="button"
              disabled={label.length === 0}
              onClick={handleCreate}
              style={{
                ...buttonStyle,
                cursor: label.length === 0 ? "not-allowed" : "pointer",
              }}
            >
              {t("createApiToken")}
            </button>
          </div>
        )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {tokens.length === 0
          ? (
            <span style={{ font: "400 11.5px var(--font-ui)", color: "var(--dim)" }}>
              {t("noApiTokensYet")}
            </span>
          )
          : tokens.map((token) => (
            <div
              key={token.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
                borderTop: "1px solid var(--line)",
                paddingTop: 6,
              }}
            >
              <span style={{ font: "500 11.5px var(--font-ui)", color: "var(--fg)" }}>
                {token.label}
              </span>
              <span style={{ font: "400 10.5px var(--font-mono)", color: "var(--dim)" }}>
                {token.scope === "read" ? t("apiTokenScopeRead") : t("apiTokenScopeWrite")}
              </span>
              <span style={{ font: "400 10.5px var(--font-mono)", color: "var(--dim)" }}>
                {t("apiTokenCreatedAt", { date: formatDate(token.createdAt) })}
              </span>
              <span style={{ font: "400 10.5px var(--font-mono)", color: "var(--dim)" }}>
                {token.lastUsedAt
                  ? t("apiTokenLastUsedAt", { date: formatDate(token.lastUsedAt) })
                  : t("apiTokenLastUsedNever")}
              </span>
              {token.revokedAt
                ? (
                  <span style={{ font: "500 10.5px var(--font-mono)", color: "var(--warn)" }}>
                    {t("apiTokenRevoked")}
                  </span>
                )
                : (
                  <button type="button" style={buttonStyle} onClick={() => handleRevoke(token.id)}>
                    {t("revokeApiToken")}
                  </button>
                )}
            </div>
          ))}
      </div>
    </div>
  );
}
