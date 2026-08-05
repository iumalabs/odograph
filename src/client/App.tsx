import { useEffect, useState } from "react";
import { addPasskey, loginWithPasskey, registerWithPasskey } from "./auth/passkey";
import type { PasskeyIdentity } from "./auth/passkey";
import { requestMagicLink } from "./auth/magic-link";
import { t } from "./i18n/strings";

// Minimal, unstyled — proves the passkey/magic-link ceremonies work
// end-to-end (plan.md). Real visual design lands once the Claude-design
// mockups are integrated as their own feature.
export function App() {
  const [email, setEmail] = useState("");
  const [identity, setIdentity] = useState<PasskeyIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkOutcome, setMagicLinkOutcome] = useState<"ok" | "error" | null>(null);

  // GET /api/v1/auth/magic-link/verify redirects here with ?magicLink=ok/
  // error (contracts/api.md) — the session cookie, if any, is already set
  // by the time this page loads.
  useEffect(() => {
    const outcome = new URLSearchParams(location.search).get("magicLink");
    if (outcome === "ok" || outcome === "error") setMagicLinkOutcome(outcome);
  }, []);

  async function handle<T>(action: () => Promise<T>, onSuccess: (result: T) => void) {
    setError(null);
    try {
      onSuccess(await action());
    } catch {
      setError(t("genericError"));
    }
  }

  return (
    <main>
      <h1>{t("appTitle")}</h1>
      <p>{t("appTagline")}</p>

      {magicLinkOutcome === "ok" && <p role="status">{t("magicLinkOkBanner")}</p>}
      {magicLinkOutcome === "error" && <p role="alert">{t("magicLinkErrorBanner")}</p>}

      {identity
        ? (
          <div>
            <p>{t("signedInAs", { tenantId: identity.tenantId ?? "" })}</p>
            <button type="button" onClick={() => handle(addPasskey, () => {})}>
              {t("addAnotherPasskey")}
            </button>
          </div>
        )
        : (
          <div>
            <label>
              {t("emailLabel")}
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => handle(() => registerWithPasskey(email), setIdentity)}
            >
              {t("signUpWithPasskey")}
            </button>
            <button type="button" onClick={() => handle(loginWithPasskey, setIdentity)}>
              {t("signInWithPasskey")}
            </button>
            <button
              type="button"
              onClick={() => handle(() => requestMagicLink(email), () => setMagicLinkSent(true))}
            >
              {t("sendMagicLink")}
            </button>
            {magicLinkSent && <p role="status">{t("magicLinkSentBanner")}</p>}
          </div>
        )}

      {error && <p role="alert">{error}</p>}
    </main>
  );
}
