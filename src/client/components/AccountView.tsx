import { ApiTokens } from "./ApiTokens";
import { AccountDeletion } from "./AccountDeletion";
import type { AccountProfile } from "../account";
import { t } from "../i18n/strings";

type AccountViewProps = {
  profile: AccountProfile | null;
  linkEmail: string;
  onLinkEmailChange: (value: string) => void;
  onAddPasskey: () => void;
  onLinkEmail: () => void;
  linkEmailSent: boolean;
  googleLinkUrl: string;
  cloudflareLinkUrl: string;
  onError: () => void;
  onConfirmDelete: () => void;
};

const cardStyle = {
  border: "1px solid var(--line)",
  background: "var(--panel)",
  borderRadius: "var(--radius-lg)",
  padding: "18px 20px",
  display: "flex",
  flexDirection: "column" as const,
  gap: 13,
};

const rowStyle = {
  display: "flex",
  alignItems: "baseline",
  gap: 11,
  font: "400 11.5px var(--font-mono)",
};

const rowLabelStyle = { color: "var(--dim)", letterSpacing: ".06em", flex: "none" as const };

const toggleStyle = {
  background: "transparent",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-md)",
  padding: "6px 10px",
  color: "var(--dim)",
  font: "500 10.5px var(--font-mono)",
  cursor: "pointer",
} as const;

// Consolidates account-level controls that used to be scattered across the Garage screen's header
// row and the Settings screen (specs/058 research.md Decision 3) — one place for identity,
// credentials, session info, and account deletion.
export function AccountView(
  {
    profile,
    linkEmail,
    onLinkEmailChange,
    onAddPasskey,
    onLinkEmail,
    linkEmailSent,
    googleLinkUrl,
    cloudflareLinkUrl,
    onError,
    onConfirmDelete,
  }: AccountViewProps,
) {
  return (
    <div style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={cardStyle}>
        <div style={{ font: "600 21px var(--font-ui)", letterSpacing: "-.02em" }}>
          {profile?.email ?? ""}
        </div>
        <div style={{ font: "400 11px var(--font-mono)", color: "var(--dim)" }}>
          {t("accountSoleOwnerNote")}
        </div>
      </div>

      <div
        className="account-grid"
        style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}
      >
        <div style={cardStyle}>
          <div style={{ font: "600 13px var(--font-ui)" }}>{t("accountCredentialsHeading")}</div>
          <div style={rowStyle}>
            <span style={rowLabelStyle}>{t("accountPasskeyCountLabel")}</span>
            <span>{profile?.passkeyCount ?? 0}</span>
          </div>
          <div style={rowStyle}>
            <span style={rowLabelStyle}>{t("accountGoogleLinkedLabel")}</span>
            <span>
              {profile?.hasGoogle ? t("accountGoogleLinkedYes") : t("accountGoogleLinkedNo")}
            </span>
          </div>
          <div style={rowStyle}>
            <span style={rowLabelStyle}>{t("accountLinkedEmailsLabel")}</span>
            <span>{profile?.linkedEmails.join(", ") || "—"}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={onAddPasskey} style={toggleStyle}>
              {t("addAnotherPasskey")}
            </button>
            <a href={googleLinkUrl} style={{ ...toggleStyle, textDecoration: "none" }}>
              {t("linkGoogleAccount")}
            </a>
            <a href={cloudflareLinkUrl} style={{ ...toggleStyle, textDecoration: "none" }}>
              {t("linkCloudflareAccount")}
            </a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ font: "400 10.5px var(--font-mono)", color: "var(--dim)" }}>
              {t("linkEmailLabel")}
            </span>
            <input
              type="email"
              value={linkEmail}
              onChange={(event) => onLinkEmailChange(event.target.value)}
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
            <button type="button" onClick={onLinkEmail} style={toggleStyle}>
              {t("linkEmail")}
            </button>
            {linkEmailSent && (
              <span style={{ font: "400 11px var(--font-mono)", color: "var(--acc)" }}>
                {t("linkEmailSentBanner")}
              </span>
            )}
          </div>

          <ApiTokens onError={onError} />
        </div>

        <div style={cardStyle}>
          <div style={{ font: "600 13px var(--font-ui)" }}>{t("accountSessionHeading")}</div>
          <div style={rowStyle}>
            <span style={rowLabelStyle}>{t("accountSessionExpiresLabel")}</span>
            <span>
              {profile?.sessionExpiresAt
                ? new Date(profile.sessionExpiresAt).toLocaleString()
                : "—"}
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          border: "1px dashed var(--line)",
          borderRadius: "var(--radius-lg)",
          padding: "20px 22px",
          display: "flex",
          alignItems: "center",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ font: "600 13px var(--font-ui)", color: "var(--dim)" }}>
            {t("accountMultiHeading")}
          </div>
          <div
            style={{
              font: "400 12px/1.65 var(--font-ui)",
              color: "var(--dim)",
              marginTop: 6,
              maxWidth: "62ch",
            }}
          >
            {t("accountMultiNote")}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: "none" }}>
          <div
            style={{
              font: "500 11px var(--font-mono)",
              color: "var(--dim)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "10px 14px",
              textAlign: "center",
              opacity: 0.55,
            }}
          >
            {t("accountSignUpSoon")}
          </div>
          <div
            style={{
              font: "500 11px var(--font-mono)",
              color: "var(--dim)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              padding: "10px 14px",
              textAlign: "center",
              opacity: 0.55,
            }}
          >
            {t("accountInviteSoon")}
          </div>
        </div>
      </div>

      <AccountDeletion onConfirmDelete={onConfirmDelete} />
    </div>
  );
}
