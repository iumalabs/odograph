import { useState } from "react";
import { Logo } from "./Logo";
import { SignInCard } from "./SignInCard";
import { HelpView } from "./HelpView";
import { useTheme } from "../theme";
import { t, useLanguage } from "../i18n/strings";
import { en as docsEn } from "../docs-content";

type MagicLinkOutcome = "ok" | "error" | "linked" | null;
type OidcOutcome = "ok" | "error" | "linked" | null;
type OidcProvider = "google" | "cloudflare" | null;

type LandingPageProps = {
  email: string;
  onEmailChange: (value: string) => void;
  onSignUpPasskey: () => void;
  onSignInPasskey: () => void;
  onSendMagicLink: () => void;
  pending: boolean;
  magicLinkSent: boolean;
  magicLinkOutcome: MagicLinkOutcome;
  oidcOutcome: OidcOutcome;
  oidcProvider: OidcProvider;
  googleSignInUrl: string;
  cloudflareSignInUrl: string;
  error: string | null;
};

const SIGN_IN_SECTION_ID = "sign-in";

function scrollToSignIn() {
  document.getElementById(SIGN_IN_SECTION_ID)?.scrollIntoView({ behavior: "smooth" });
}

const docsLinkStyle = {
  font: "500 11.5px var(--font-ui)",
  color: "var(--dim)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-md)",
  padding: "8px 13px",
  cursor: "pointer",
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
} as const;

// The unauthenticated entry point (specs/056), replacing the former AuthScreen wholesale — it's
// the sole `!identity` render branch in App.tsx, covering both first-time visitors and
// session-expired ones (no separate sign-out screen, matching the app's existing behavior). Ported
// from the "landing" state of the Claude Design "Кокпит" mockup, with its Cloudflare-Access/
// self-hosted/single-owner copy rewritten to match the app's real hosted, open-signup,
// multi-tenant product (research.md Decision 3) and its fabricated demo-stats panel replaced by
// the real SignInCard (Decision 1).
export function LandingPage(props: LandingPageProps) {
  const [, toggleTheme] = useTheme();
  const [language, setLanguage] = useLanguage();
  // Renders HelpView in place instead of opening an external link (specs/057 research.md Decision
  // 3) — reuses LandingPage's own header rather than a new signed-out "guest shell" chrome.
  const [showDocs, setShowDocs] = useState(false);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--fg)" }}>
      <header
        style={{
          height: 64,
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "0 30px",
          borderBottom: "1px solid var(--line)",
          background: "var(--panel)",
        }}
      >
        <Logo size={26} withWordmark />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 9 }}>
          <button
            type="button"
            onClick={() => setShowDocs(true)}
            style={docsLinkStyle}
          >
            {t("landingDocsLink")}
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
          <button
            type="button"
            onClick={() => setLanguage(language === "en" ? "ru" : "en")}
            style={{
              height: 32,
              padding: "0 10px",
              display: "grid",
              placeItems: "center",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              background: "transparent",
              cursor: "pointer",
              font: "600 11.5px var(--font-ui)",
              color: "var(--dim)",
            }}
          >
            {language === "en" ? t("languageToggleToRu") : t("languageToggleToEn")}
          </button>
          <button
            type="button"
            onClick={scrollToSignIn}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "var(--acc)",
              color: "var(--on-acc)",
              border: "none",
              borderRadius: "var(--radius-md)",
              padding: "8px 14px",
              font: "600 11.5px var(--font-ui)",
              cursor: "pointer",
            }}
          >
            {t("landingSignInButton")}
          </button>
        </div>
      </header>

      {showDocs
        ? (
          <div style={{ padding: "38px 30px" }}>
            <HelpView sections={docsEn} onBack={() => setShowDocs(false)} />
          </div>
        )
        : (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "38px 30px",
            }}
          >
            <div
              className="landing-hero"
              style={{
                width: "100%",
                maxWidth: 1080,
                display: "grid",
                gridTemplateColumns: "minmax(0,1.05fr) minmax(0,.95fr)",
                gap: 44,
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>
                <div
                  style={{
                    font: "400 10.5px var(--font-mono)",
                    color: "var(--acc)",
                    letterSpacing: ".14em",
                  }}
                >
                  {t("landingKicker")}
                </div>
                <div
                  style={{
                    font: "700 48px/1.06 var(--font-ui)",
                    letterSpacing: "-.035em",
                    textWrap: "pretty",
                  }}
                >
                  {t("landingHeadlineLine1")}
                  <br />
                  {t("landingHeadlineLine2")}
                  <br />
                  {t("landingHeadlineLine3")}
                </div>
                <div
                  style={{
                    font: "400 14px/1.6 var(--font-ui)",
                    color: "var(--dim)",
                    maxWidth: 430,
                    textWrap: "pretty",
                  }}
                >
                  {t("landingLead")}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 7,
                    font: "400 11px/1.6 var(--font-mono)",
                    color: "var(--dim)",
                    borderTop: "1px solid var(--line)",
                    paddingTop: 17,
                  }}
                >
                  <div>{t("landingNote1")}</div>
                  <div>{t("landingNote2")}</div>
                </div>
              </div>

              <div id={SIGN_IN_SECTION_ID}>
                <SignInCard {...props} />
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
