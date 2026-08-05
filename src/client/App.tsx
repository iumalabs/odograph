import { useEffect, useState } from "react";
import { addPasskey, loginWithPasskey, registerWithPasskey } from "./auth/passkey";
import type { PasskeyIdentity } from "./auth/passkey";
import { requestMagicLink, requestMagicLinkLink } from "./auth/magic-link";
import { GOOGLE_LINK_URL, GOOGLE_SIGN_IN_URL } from "./auth/oidc";
import { getCurrentIdentity } from "./auth/session";
import { createVehicle, listVehicles } from "./vehicles";
import type { Vehicle } from "./vehicles";
import { createServiceRecord, listServiceRecords, uploadAttachment } from "./service-records";
import type { Attachment, ServiceRecord } from "./service-records";
import { t } from "./i18n/strings";
import { AppShell } from "./components/AppShell";
import { AuthScreen } from "./components/AuthScreen";
import { Garage } from "./components/Garage";
import { ServiceRecordPanel } from "./components/ServiceRecordPanel";

type MagicLinkOutcome = "ok" | "error" | "linked" | null;
type OidcOutcome = "ok" | "error" | "linked" | null;

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
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [serviceRecords, setServiceRecords] = useState<ServiceRecord[]>([]);
  const [serviceDate, setServiceDate] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [attachmentsByRecordId, setAttachmentsByRecordId] = useState<Record<string, Attachment[]>>(
    {},
  );

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

  useEffect(() => {
    if (!selectedVehicleId) {
      setServiceRecords([]);
      return;
    }
    listServiceRecords(selectedVehicleId).then(setServiceRecords).catch(() =>
      setError(t("genericError"))
    );
  }, [selectedVehicleId]);

  async function handle<T>(action: () => Promise<T>, onSuccess: (result: T) => void) {
    setError(null);
    try {
      onSuccess(await action());
    } catch {
      setError(t("genericError"));
    }
  }

  async function handleUploadAttachment(recordId: string, file: File) {
    setError(null);
    try {
      const attachment = await uploadAttachment(recordId, file);
      setAttachmentsByRecordId((current) => ({
        ...current,
        [recordId]: [...(current[recordId] ?? []), attachment],
      }));
    } catch {
      setError(t("genericError"));
    }
  }

  if (!identity) {
    return (
      <AuthScreen
        email={email}
        onEmailChange={setEmail}
        onSignUpPasskey={() => handle(() => registerWithPasskey(email), setIdentity)}
        onSignInPasskey={() => handle(loginWithPasskey, setIdentity)}
        onSendMagicLink={() => handle(() => requestMagicLink(email), () => setMagicLinkSent(true))}
        magicLinkSent={magicLinkSent}
        magicLinkOutcome={magicLinkOutcome}
        oidcOutcome={oidcOutcome}
        googleSignInUrl={GOOGLE_SIGN_IN_URL}
        error={error}
      />
    );
  }

  return (
    <AppShell title={t("vehiclesHeading")}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ font: "400 11.5px var(--font-mono)", color: "var(--dim)" }}>
            {t("signedInAs", { tenantId: identity.tenantId ?? "" })}
          </span>
          <button
            type="button"
            onClick={() => handle(addPasskey, () => {})}
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
            {t("addAnotherPasskey")}
          </button>
          <a
            href={GOOGLE_LINK_URL}
            style={{
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              padding: "6px 10px",
              color: "var(--dim)",
              font: "500 10.5px var(--font-mono)",
              textDecoration: "none",
            }}
          >
            {t("linkGoogleAccount")}
          </a>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ font: "400 10.5px var(--font-mono)", color: "var(--dim)" }}>
              {t("linkEmailLabel")}
            </span>
            <input
              type="email"
              value={linkEmail}
              onChange={(event) => setLinkEmail(event.target.value)}
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
          <button
            type="button"
            onClick={() =>
              handle(() => requestMagicLinkLink(linkEmail), () => setLinkEmailSent(true))}
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
            {t("linkEmail")}
          </button>
          {linkEmailSent && (
            <span style={{ font: "400 11px var(--font-mono)", color: "var(--acc)" }}>
              {t("linkEmailSentBanner")}
            </span>
          )}
        </div>

        <Garage
          vehicles={vehicles}
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={(id) => setSelectedVehicleId(selectedVehicleId === id ? null : id)}
          vehicleName={vehicleName}
          onVehicleNameChange={setVehicleName}
          vehicleOdometerUnit={vehicleOdometerUnit}
          onVehicleOdometerUnitChange={setVehicleOdometerUnit}
          onAddVehicle={() =>
            handle(
              () => createVehicle({ name: vehicleName, odometerUnit: vehicleOdometerUnit }),
              (vehicle) => {
                setVehicles((current) => [...current, vehicle]);
                setVehicleName("");
              },
            )}
        />

        {selectedVehicleId && (
          <div>
            <h2 style={{ font: "600 14px var(--font-ui)", letterSpacing: "-.01em" }}>
              {t("serviceRecordsHeading")}
            </h2>
            <ServiceRecordPanel
              records={serviceRecords}
              serviceDate={serviceDate}
              onServiceDateChange={setServiceDate}
              serviceDescription={serviceDescription}
              onServiceDescriptionChange={setServiceDescription}
              onAddRecord={() =>
                handle(
                  () =>
                    createServiceRecord(selectedVehicleId, {
                      serviceDate,
                      description: serviceDescription,
                    }),
                  (record) => {
                    setServiceRecords((current) => [...current, record]);
                    setServiceDate("");
                    setServiceDescription("");
                  },
                )}
              onUploadAttachment={handleUploadAttachment}
              attachmentsByRecordId={attachmentsByRecordId}
            />
          </div>
        )}

        {error && (
          <p role="alert" style={{ color: "var(--warn)", font: "400 12.5px var(--font-ui)" }}>
            {error}
          </p>
        )}
      </div>
    </AppShell>
  );
}
