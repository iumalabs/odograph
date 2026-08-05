import { useState } from "react";
import { addPasskey, loginWithPasskey, registerWithPasskey } from "./auth/passkey";
import type { PasskeyIdentity } from "./auth/passkey";
import { t } from "./i18n/strings";

// Minimal, unstyled — proves the passkey ceremony works end-to-end
// (plan.md). Real visual design lands once the Claude-design mockups are
// integrated as their own feature.
export function App() {
  const [email, setEmail] = useState("");
  const [identity, setIdentity] = useState<PasskeyIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          </div>
        )}

      {error && <p role="alert">{error}</p>}
    </main>
  );
}
