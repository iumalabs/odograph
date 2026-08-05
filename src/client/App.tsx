import { useEffect, useState } from "react";
import { addPasskey, loginWithPasskey, registerWithPasskey } from "./auth/passkey";
import type { PasskeyIdentity } from "./auth/passkey";
import { requestMagicLink, requestMagicLinkLink } from "./auth/magic-link";
import { GOOGLE_LINK_URL, GOOGLE_SIGN_IN_URL } from "./auth/oidc";
import { getCurrentIdentity } from "./auth/session";
import { createVehicle, listVehicles } from "./vehicles";
import type { Vehicle } from "./vehicles";
import { t } from "./i18n/strings";

type MagicLinkOutcome = "ok" | "error" | "linked" | null;
type OidcOutcome = "ok" | "error" | "linked" | null;

// Minimal, unstyled — proves the passkey/magic-link/Google ceremonies work
// end-to-end (plan.md). Real visual design lands once the Claude-design
// mockups are integrated as their own feature.
export function App() {
  const [email, setEmail] = useState("");
  const [linkEmail, setLinkEmail] = useState("");
  const [identity, setIdentity] = useState<PasskeyIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [linkEmailSent, setLinkEmailSent] = useState(false);
  const [magicLinkOutcome, setMagicLinkOutcome] = useState<MagicLinkOutcome>(null);
  const [oidcOutcome, setOidcOutcome] = useState<OidcOutcome>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleName, setVehicleName] = useState("");
  const [vehicleOdometerUnit, setVehicleOdometerUnit] = useState<"km" | "mi">("km");

  // GET /api/v1/auth/magic-link/verify redirects here with ?magicLink=ok/
  // error/linked, and GET /api/v1/auth/oidc/google/callback with
  // ?oidc=ok/error/linked (contracts/api.md) — the session cookie, if any,
  // is already set by the time this page loads.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const magicLinkOutcomeParam = params.get("magicLink");
    if (
      magicLinkOutcomeParam === "ok" || magicLinkOutcomeParam === "error" ||
      magicLinkOutcomeParam === "linked"
    ) {
      setMagicLinkOutcome(magicLinkOutcomeParam);
    }
    const oidcOutcomeParam = params.get("oidc");
    if (
      oidcOutcomeParam === "ok" || oidcOutcomeParam === "error" || oidcOutcomeParam === "linked"
    ) {
      setOidcOutcome(oidcOutcomeParam);
    }
  }, []);

  // Discovers an existing session on page load — passkey's identity comes
  // straight from its own ceremony response, but magic-link/Google sign-ins
  // redirect here server-side and never touch client state otherwise.
  useEffect(() => {
    getCurrentIdentity().then((found) => {
      if (found) setIdentity(found);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!identity) return;
    listVehicles().then(setVehicles).catch(() => setError(t("genericError")));
  }, [identity]);

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
      {magicLinkOutcome === "linked" && <p role="status">{t("magicLinkLinkedBanner")}</p>}
      {oidcOutcome === "ok" && <p role="status">{t("oidcOkBanner")}</p>}
      {oidcOutcome === "error" && <p role="alert">{t("oidcErrorBanner")}</p>}
      {oidcOutcome === "linked" && <p role="status">{t("oidcLinkedBanner")}</p>}

      {identity
        ? (
          <div>
            <p>{t("signedInAs", { tenantId: identity.tenantId ?? "" })}</p>
            <button type="button" onClick={() => handle(addPasskey, () => {})}>
              {t("addAnotherPasskey")}
            </button>
            <label>
              {t("linkEmailLabel")}
              <input
                type="email"
                value={linkEmail}
                onChange={(event) => setLinkEmail(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() =>
                handle(() => requestMagicLinkLink(linkEmail), () => setLinkEmailSent(true))}
            >
              {t("linkEmail")}
            </button>
            {linkEmailSent && <p role="status">{t("linkEmailSentBanner")}</p>}
            <a href={GOOGLE_LINK_URL}>{t("linkGoogleAccount")}</a>

            <h2>{t("vehiclesHeading")}</h2>
            {vehicles.length === 0 ? <p>{t("noVehiclesYet")}</p> : (
              <ul>
                {vehicles.map((vehicle) => (
                  <li key={vehicle.id}>
                    {vehicle.name}
                    {vehicle.make ? ` — ${vehicle.make}` : ""}
                    {vehicle.model ? ` ${vehicle.model}` : ""}
                    {vehicle.year ? ` (${vehicle.year})` : ""}
                  </li>
                ))}
              </ul>
            )}
            <label>
              {t("vehicleNameLabel")}
              <input
                type="text"
                value={vehicleName}
                onChange={(event) => setVehicleName(event.target.value)}
              />
            </label>
            <label>
              {t("vehicleOdometerUnitLabel")}
              <select
                value={vehicleOdometerUnit}
                onChange={(event) => setVehicleOdometerUnit(event.target.value as "km" | "mi")}
              >
                <option value="km">km</option>
                <option value="mi">mi</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() =>
                handle(
                  () => createVehicle({ name: vehicleName, odometerUnit: vehicleOdometerUnit }),
                  (vehicle) => {
                    setVehicles((current) => [...current, vehicle]);
                    setVehicleName("");
                  },
                )}
            >
              {t("addVehicle")}
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
            <a href={GOOGLE_SIGN_IN_URL}>{t("continueWithGoogle")}</a>
          </div>
        )}

      {error && <p role="alert">{error}</p>}
    </main>
  );
}
