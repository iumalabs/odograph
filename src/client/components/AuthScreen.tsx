import type { CSSProperties, ReactNode } from "react";
import { Logo } from "./Logo";
import { t } from "../i18n/strings";
import { useTheme } from "../theme";

type MagicLinkOutcome = "ok" | "error" | "linked" | null;
type OidcOutcome = "ok" | "error" | "linked" | null;

type AuthScreenProps = {
  email: string;
  onEmailChange: (value: string) => void;
  onSignUpPasskey: () => void;
  onSignInPasskey: () => void;
  onSendMagicLink: () => void;
  // Disables the three actions below while one is already in flight — a slow WebAuthn prompt
  // left clickable the whole time let a double-click fire two concurrent ceremonies (App.tsx).
  pending: boolean;
  magicLinkSent: boolean;
  magicLinkOutcome: MagicLinkOutcome;
  oidcOutcome: OidcOutcome;
  googleSignInUrl: string;
  error: string | null;
};

const inputStyle: CSSProperties = {
  background: "var(--panel2)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-md)",
  padding: "11px 12px",
  color: "var(--fg)",
  font: "500 14px var(--font-ui)",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const primaryButtonStyle: CSSProperties = {
  background: "var(--acc)",
  color: "var(--on-acc)",
  border: "1px solid var(--acc)",
  borderRadius: "var(--radius-md)",
  padding: "9px 14px",
  font: "600 11.5px var(--font-ui)",
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  background: "transparent",
  color: "var(--fg)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-md)",
  padding: "9px 14px",
  font: "600 11.5px var(--font-ui)",
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

function Banner({ kind, children }: { kind: "info" | "error"; children: ReactNode }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      style={{
        borderLeft: `2px solid ${kind === "error" ? "var(--warn)" : "var(--acc2)"}`,
        padding: "8px 12px",
        margin: "0 0 12px",
        font: "400 12.5px var(--font-ui)",
        background: "var(--panel2)",
      }}
    >
      {children}
    </p>
  );
}

// Extracted from App.tsx's signed-out branch (spec 008 T008) — same state/handlers, restyled to
// the approved design (docs/odograph-design.zip).
export function AuthScreen(props: AuthScreenProps) {
  const {
    email,
    onEmailChange,
    onSignUpPasskey,
    onSignInPasskey,
    onSendMagicLink,
    pending,
    magicLinkSent,
    magicLinkOutcome,
    oidcOutcome,
    googleSignInUrl,
    error,
  } = props;

  const [, toggleTheme] = useTheme();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        color: "var(--fg)",
        padding: 24,
        position: "relative",
      }}
    >
      <button
        type="button"
        onClick={toggleTheme}
        style={{
          position: "absolute",
          top: 20,
          right: 20,
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
      <div
        style={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 18 }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <Logo size={44} withWordmark />
          <p style={{ color: "var(--dim)", font: "400 12px var(--font-mono)", margin: 0 }}>
            {t("appTagline")}
          </p>
        </div>

        {magicLinkOutcome === "ok" && <Banner kind="info">{t("magicLinkOkBanner")}</Banner>}
        {magicLinkOutcome === "error" && <Banner kind="error">{t("magicLinkErrorBanner")}</Banner>}
        {magicLinkOutcome === "linked" && <Banner kind="info">{t("magicLinkLinkedBanner")}</Banner>}
        {oidcOutcome === "ok" && <Banner kind="info">{t("oidcOkBanner")}</Banner>}
        {oidcOutcome === "error" && <Banner kind="error">{t("oidcErrorBanner")}</Banner>}
        {oidcOutcome === "linked" && <Banner kind="info">{t("oidcLinkedBanner")}</Banner>}

        <div
          style={{
            border: "1px solid var(--line)",
            background: "var(--panel)",
            borderRadius: "var(--radius-lg)",
            padding: 22,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span
              style={{
                font: "400 9.5px var(--font-mono)",
                color: "var(--dim)",
                letterSpacing: ".08em",
              }}
            >
              {t("emailLabel")}
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              style={inputStyle}
            />
          </label>

          <button
            type="button"
            onClick={onSignUpPasskey}
            disabled={pending}
            style={pending
              ? { ...primaryButtonStyle, opacity: 0.6, cursor: "default" }
              : primaryButtonStyle}
          >
            {t("signUpWithPasskey")}
          </button>
          <button
            type="button"
            onClick={onSignInPasskey}
            disabled={pending}
            style={pending
              ? { ...secondaryButtonStyle, opacity: 0.6, cursor: "default" }
              : secondaryButtonStyle}
          >
            {t("signInWithPasskey")}
          </button>
          <button
            type="button"
            onClick={onSendMagicLink}
            disabled={pending}
            style={pending
              ? { ...secondaryButtonStyle, opacity: 0.6, cursor: "default" }
              : secondaryButtonStyle}
          >
            {t("sendMagicLink")}
          </button>
          {magicLinkSent && <Banner kind="info">{t("magicLinkSentBanner")}</Banner>}
          <a href={googleSignInUrl} style={secondaryButtonStyle}>
            {t("continueWithGoogle")}
          </a>
        </div>

        {error && <Banner kind="error">{error}</Banner>}
      </div>
    </div>
  );
}
