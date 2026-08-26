import type { CSSProperties, ReactNode } from "react";
import { t } from "../i18n/strings";

type MagicLinkOutcome = "ok" | "error" | "linked" | null;
type OidcOutcome = "ok" | "error" | "linked" | null;

type SignInCardProps = {
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

// The app's real sign-in form — extracted from the former AuthScreen.tsx (specs/056) so it can be
// embedded in the landing page's hero instead of only centered full-page. Same props, same
// pending/banner behavior; no logic changed by the extraction.
export function SignInCard(props: SignInCardProps) {
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

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
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
  );
}
