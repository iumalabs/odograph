import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { addPasskey, loginWithPasskey, registerWithPasskey } from "./auth/passkey";
import type { PasskeyIdentity } from "./auth/passkey";
import { requestMagicLink, requestMagicLinkLink } from "./auth/magic-link";
import { GOOGLE_LINK_URL, GOOGLE_SIGN_IN_URL } from "./auth/oidc";
import { getCurrentIdentity } from "./auth/session";
import { deleteAccount, REQUIRED_CONFIRMATION_PHRASE } from "./account";
import { createVehicle, listVehicles } from "./vehicles";
import type { Vehicle } from "./vehicles";
import { lookupVin } from "./vin-lookup";
import {
  AttachmentUploadError,
  createServiceRecord,
  deleteServiceRecord,
  dismissDuplicate as dismissServiceDuplicate,
  listServiceRecords,
  updateServiceRecord,
  uploadAttachment,
} from "./service-records";
import type { Attachment, ServiceRecord } from "./service-records";
import {
  AttachmentUploadError as FuelAttachmentUploadError,
  createFuelRecord,
  deleteFuelRecord,
  dismissDuplicate as dismissFuelDuplicate,
  listFuelRecords,
  updateFuelRecord,
  uploadAttachment as uploadFuelAttachment,
} from "./fuel-records";
import type { FuelRecord } from "./fuel-records";
import {
  createReminderRule,
  deleteReminderRule,
  listReminderRules,
  markDone as markReminderDone,
} from "./reminder-rules";
import type { ReminderRule } from "./reminder-rules";
import {
  AttachmentUploadError as DocumentAttachmentUploadError,
  createDocument,
  deleteDocument,
  listDocuments,
  updateDocument,
  uploadDocumentAttachment,
} from "./documents";
import type { DocumentCategory, VehicleDocument } from "./documents";
import {
  createPlanCard,
  deletePlanCard,
  listPlanCards,
  updatePlanCard as updatePlanCardApi,
} from "./plan-cards";
import type { PlanCard, PlanCardStage } from "./plan-cards";
import { t } from "./i18n/strings";
import type { AppView } from "./components/AppShell";
import { AppShell } from "./components/AppShell";
import { AuthScreen } from "./components/AuthScreen";
import { SettingsView } from "./components/SettingsView";
import { Garage } from "./components/Garage";
import { SearchBar } from "./components/SearchBar";
import { ServiceRecordPanel } from "./components/ServiceRecordPanel";
import { FuelRecordPanel } from "./components/FuelRecordPanel";
import { ReminderRulePanel } from "./components/ReminderRulePanel";
import { DocumentPanel } from "./components/DocumentPanel";
import { PlanBoard } from "./components/PlanBoard";
import { ExpenseBreakdownPanel } from "./components/ExpenseBreakdownPanel";
import { reportDownloadUrl } from "./vehicle-aggregates";
import { DashboardView } from "./components/DashboardView";
import { SyncStatusIndicator } from "./components/SyncStatusIndicator";
import { SyncReviewScreen } from "./components/SyncReviewScreen";
import {
  mergeFuelRecords,
  mergePlanCards,
  mergeReminderRules,
  mergeServiceRecords,
  mergeVehicles,
} from "./offline/merge";
import {
  getSnapshot as getQueueSnapshot,
  onSyncEvent,
  resolveReauth,
  subscribe as subscribeQueue,
} from "./offline/queue";
import type { PendingActionType } from "./offline/types";

type MagicLinkOutcome = "ok" | "error" | "linked" | null;
type OidcOutcome = "ok" | "error" | "linked" | null;

export function App() {
  const [view, setView] = useState<AppView>("garage");
  const [email, setEmail] = useState("");
  const [linkEmail, setLinkEmail] = useState("");
  const [identity, setIdentity] = useState<PasskeyIdentity | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Guards the three AuthScreen actions (passkey sign-up/sign-in, magic link) against a
  // double-click firing two concurrent ceremonies — a slow WebAuthn prompt (Touch ID/Windows
  // Hello) left the buttons clickable the whole time, and a second navigator.credentials.create()
  // call implicitly aborts the first while consuming a *different* server-issued challenge,
  // which can surface as a same-request "challenge not found or already consumed" failure
  // (investigated live for issue #46).
  const [authPending, setAuthPending] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [linkEmailSent, setLinkEmailSent] = useState(false);
  const [magicLinkOutcome, setMagicLinkOutcome] = useState<MagicLinkOutcome>(null);
  const [oidcOutcome, setOidcOutcome] = useState<OidcOutcome>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleName, setVehicleName] = useState("");
  const [vehicleOdometerUnit, setVehicleOdometerUnit] = useState<"km" | "mi">("km");
  const [vehicleVin, setVehicleVin] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vinLookupPending, setVinLookupPending] = useState(false);
  const [vinLookupNotFound, setVinLookupNotFound] = useState(false);
  // Bumped whenever the add-vehicle form is reset (a successful create) so a lookup already in
  // flight at that moment can detect it's stale and not apply its result to the next vehicle's
  // now-blank form (code-review finding — createVehicle resolves near-instantly since it only
  // writes to the local offline queue, so it can easily finish before a slower NHTSA round trip).
  const vinLookupFormGeneration = useRef(0);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [serviceRecords, setServiceRecords] = useState<ServiceRecord[]>([]);
  const [serviceDate, setServiceDate] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [attachmentsByRecordId, setAttachmentsByRecordId] = useState<Record<string, Attachment[]>>(
    {},
  );
  const [fuelRecords, setFuelRecords] = useState<FuelRecord[]>([]);
  const [fuelDate, setFuelDate] = useState("");
  const [fuelOdometerReading, setFuelOdometerReading] = useState("");
  const [fuelVolume, setFuelVolume] = useState("");
  const [fuelCost, setFuelCost] = useState("");
  const [fuelAttachmentsByRecordId, setFuelAttachmentsByRecordId] = useState<
    Record<string, Attachment[]>
  >({});
  const [reminderRules, setReminderRules] = useState<ReminderRule[]>([]);
  const [reminderLabel, setReminderLabel] = useState("");
  const [reminderIntervalDays, setReminderIntervalDays] = useState("");
  const [reminderIntervalDistance, setReminderIntervalDistance] = useState("");
  const [reminderLastDoneDate, setReminderLastDoneDate] = useState("");
  const [reminderLastDoneOdometer, setReminderLastDoneOdometer] = useState("");
  // Not routed through the offline write queue (spec 020) — documents (specs/023) explicitly
  // scope offline sync out, so this state is plain fetched-then-locally-patched data, not a
  // merge.ts overlay like serviceRecords/fuelRecords/reminderRules above.
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [documentTitle, setDocumentTitle] = useState("");
  const [documentCategory, setDocumentCategory] = useState<DocumentCategory>("registration");
  const [documentAttachmentsByDocumentId, setDocumentAttachmentsByDocumentId] = useState<
    Record<string, Attachment[]>
  >({});
  // Routed through the offline write queue (spec 020), unlike documents above — the issue's own
  // text explicitly requires it for plan cards.
  const [planCards, setPlanCards] = useState<PlanCard[]>([]);
  const [planCardTitle, setPlanCardTitle] = useState("");
  const [planCardTargetDate, setPlanCardTargetDate] = useState("");
  const [planCardEstimatedCost, setPlanCardEstimatedCost] = useState("");
  const [planCardUrgent, setPlanCardUrgent] = useState(false);

  // Offline write queue (spec 020): re-renders whenever a pending/rejected action changes, so the
  // lists below always reflect the queue's current state without a manual refetch.
  const queueSnapshot = useSyncExternalStore(subscribeQueue, getQueueSnapshot);
  const rejectedActionCount = queueSnapshot.actions.filter((a) => a.status === "rejected").length;
  const mergedVehicles = mergeVehicles(vehicles, queueSnapshot.actions);
  const vehicleScopedActions = queueSnapshot.actions.filter((a) =>
    a.vehicleId === selectedVehicleId
  );
  const mergedServiceRecords = mergeServiceRecords(serviceRecords, vehicleScopedActions);
  const mergedFuelRecords = mergeFuelRecords(fuelRecords, vehicleScopedActions);
  const mergedReminderRules = mergeReminderRules(reminderRules, vehicleScopedActions);
  const mergedPlanCards = mergePlanCards(planCards, vehicleScopedActions);

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

  // Resumes a queue paused on a 401 once the user signs back in (research.md) — a no-op if the
  // queue was never paused (e.g. ordinary first sign-in).
  useEffect(() => {
    if (identity) resolveReauth();
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

  useEffect(() => {
    if (!selectedVehicleId) {
      setFuelRecords([]);
      return;
    }
    listFuelRecords(selectedVehicleId).then(setFuelRecords).catch(() =>
      setError(t("genericError"))
    );
  }, [selectedVehicleId]);

  useEffect(() => {
    if (!selectedVehicleId) {
      setReminderRules([]);
      return;
    }
    listReminderRules(selectedVehicleId).then(setReminderRules).catch(() =>
      setError(t("genericError"))
    );
  }, [selectedVehicleId]);

  useEffect(() => {
    if (!selectedVehicleId) {
      setDocuments([]);
      return;
    }
    listDocuments(selectedVehicleId).then(setDocuments).catch(() => setError(t("genericError")));
  }, [selectedVehicleId]);

  useEffect(() => {
    if (!selectedVehicleId) {
      setPlanCards([]);
      return;
    }
    listPlanCards(selectedVehicleId).then(setPlanCards).catch(() => setError(t("genericError")));
  }, [selectedVehicleId]);

  // Once a queued action actually syncs, patch it into the cached server-confirmed list (the
  // same "apply the server's response" pattern every handler used before this feature) and let it
  // fall out of the queue snapshot — merge.ts stops overlaying it automatically. Re-subscribes on
  // every vehicle switch so it always applies to the vehicle currently being viewed, never a
  // stale one captured at mount time.
  useEffect(() => {
    function upsert<T extends { id: string }>(
      setState: (updater: (current: T[]) => T[]) => void,
      actionType: PendingActionType,
      resourceId: string,
      responseBody: unknown,
    ) {
      if (actionType === "delete") {
        setState((current) => current.filter((record) => record.id !== resourceId));
        return;
      }
      const record = responseBody as T;
      setState((current) =>
        current.some((existing) => existing.id === record.id)
          ? current.map((existing) => existing.id === record.id ? record : existing)
          : [...current, record]
      );
    }

    return onSyncEvent((event) => {
      if (event.type === "needsReauth") {
        // This app has no separate sign-out/session-expired screen — reusing AuthScreen (already
        // shown whenever `identity` is null) is the smallest correct way to get the user back to
        // a working sign-in flow (FR-011), rather than building a second one.
        setIdentity(null);
        return;
      }
      if (event.type !== "synced") return;
      const { action, responseBody } = event;

      if (action.entity === "vehicle") {
        upsert<Vehicle>(setVehicles, action.actionType, action.resourceId, responseBody);
      } else if (action.entity === "serviceRecord" && action.vehicleId === selectedVehicleId) {
        upsert<ServiceRecord>(
          setServiceRecords,
          action.actionType,
          action.resourceId,
          responseBody,
        );
      } else if (action.entity === "fuelRecord" && action.vehicleId === selectedVehicleId) {
        upsert<FuelRecord>(setFuelRecords, action.actionType, action.resourceId, responseBody);
      } else if (action.entity === "reminderRule" && action.vehicleId === selectedVehicleId) {
        upsert<ReminderRule>(
          setReminderRules,
          action.actionType,
          action.resourceId,
          responseBody,
        );
      } else if (action.entity === "planCard" && action.vehicleId === selectedVehicleId) {
        upsert<PlanCard>(setPlanCards, action.actionType, action.resourceId, responseBody);
      }
    });
  }, [selectedVehicleId]);

  async function handle<T>(action: () => Promise<T>, onSuccess: (result: T) => void) {
    setError(null);
    try {
      onSuccess(await action());
    } catch {
      setError(t("genericError"));
    }
  }

  async function handleDeleteAccount() {
    setError(null);
    try {
      await deleteAccount(REQUIRED_CONFIRMATION_PHRASE);
      setIdentity(null);
    } catch {
      setError(t("genericError"));
    }
  }

  // Pre-submit assist step, not part of vehicle creation itself (specs/030 FR-009) — never
  // enqueued, always resolves rather than throwing (vin-lookup.ts). Only fields the lookup
  // actually returned are pre-filled; the VIN input is locked while in flight so a stale response
  // can never land against a VIN the owner has since changed (speckit-analyze finding, FR-011).
  // Also guarded against a subtler race (code-review finding): createVehicle resolves near-
  // instantly (local offline queue write, no network round trip), so the owner can submit and
  // reset the form for a *second* vehicle before this lookup's NHTSA round trip returns — the
  // generation check below discards the result rather than pre-filling the wrong vehicle's form.
  async function handleLookupVin() {
    const generation = vinLookupFormGeneration.current;
    setVinLookupPending(true);
    setVinLookupNotFound(false);
    const result = await lookupVin(vehicleVin);
    setVinLookupPending(false);
    if (generation !== vinLookupFormGeneration.current) return;
    if (!result.found) {
      setVinLookupNotFound(true);
      return;
    }
    if (result.make !== null) setVehicleMake(result.make);
    if (result.model !== null) setVehicleModel(result.model);
    if (result.year !== null) setVehicleYear(String(result.year));
  }

  async function handleAuthAction<T>(action: () => Promise<T>, onSuccess: (result: T) => void) {
    if (authPending) return;
    setAuthPending(true);
    try {
      await handle(action, onSuccess);
    } finally {
      setAuthPending(false);
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
    } catch (error) {
      if (error instanceof AttachmentUploadError && error.code === "file_too_large") {
        setError(t("attachmentTooLargeError"));
      } else if (
        error instanceof AttachmentUploadError && error.code === "unsupported_file_type"
      ) {
        setError(t("attachmentUnsupportedTypeError"));
      } else {
        setError(t("genericError"));
      }
    }
  }

  async function handleUploadFuelAttachment(recordId: string, file: File) {
    setError(null);
    try {
      const attachment = await uploadFuelAttachment(recordId, file);
      setFuelAttachmentsByRecordId((current) => ({
        ...current,
        [recordId]: [...(current[recordId] ?? []), attachment],
      }));
    } catch (error) {
      if (error instanceof FuelAttachmentUploadError && error.code === "file_too_large") {
        setError(t("attachmentTooLargeError"));
      } else if (
        error instanceof FuelAttachmentUploadError && error.code === "unsupported_file_type"
      ) {
        setError(t("attachmentUnsupportedTypeError"));
      } else {
        setError(t("genericError"));
      }
    }
  }

  async function handleUploadDocumentAttachment(documentId: string, file: File) {
    setError(null);
    try {
      const attachment = await uploadDocumentAttachment(documentId, file);
      setDocumentAttachmentsByDocumentId((current) => ({
        ...current,
        [documentId]: [...(current[documentId] ?? []), attachment],
      }));
    } catch (error) {
      if (error instanceof DocumentAttachmentUploadError && error.code === "file_too_large") {
        setError(t("attachmentTooLargeError"));
      } else if (
        error instanceof DocumentAttachmentUploadError && error.code === "unsupported_file_type"
      ) {
        setError(t("attachmentUnsupportedTypeError"));
      } else {
        setError(t("genericError"));
      }
    }
  }

  // Plain fetch-then-patch-local-state, not the offline-queue pattern below — documents
  // (specs/023) explicitly scope offline sync out, so there's no merge.ts overlay or
  // onSyncEvent-driven confirmation to wait for.
  function handleUpdateDocument(
    documentId: string,
    patch: {
      title: string;
      category: DocumentCategory;
      expiryDate: string | null;
      notes: string | null;
    },
  ) {
    handle(
      () => updateDocument(documentId, patch),
      (updated) => setDocuments((current) => current.map((d) => d.id === documentId ? updated : d)),
    );
  }

  function handleDeleteDocument(documentId: string) {
    handle(
      () => deleteDocument(documentId),
      () => setDocuments((current) => current.filter((d) => d.id !== documentId)),
    );
  }

  // These all route through the offline write queue (spec 020) — nothing to apply to state
  // directly here. The pending overlay comes from merge.ts on every render; the confirmed
  // server-side result gets applied by the onSyncEvent effect above once it actually syncs.

  function handleDismissServiceDuplicate(recordId: string) {
    if (!selectedVehicleId) return;
    handle(() => dismissServiceDuplicate(recordId, selectedVehicleId), () => {});
  }

  function handleDismissFuelDuplicate(recordId: string) {
    if (!selectedVehicleId) return;
    handle(() => dismissFuelDuplicate(recordId, selectedVehicleId), () => {});
  }

  function handleUpdateServiceRecord(
    recordId: string,
    patch: {
      serviceDate: string;
      description: string;
      odometerReading: number | null;
      cost: number | null;
      notes: string | null;
    },
  ) {
    if (!selectedVehicleId) return;
    handle(() => updateServiceRecord(recordId, selectedVehicleId, patch), () => {});
  }

  function handleDeleteServiceRecord(recordId: string) {
    if (!selectedVehicleId) return;
    handle(() => deleteServiceRecord(recordId, selectedVehicleId), () => {});
  }

  function handleUpdateFuelRecord(
    recordId: string,
    patch: {
      fuelDate: string;
      odometerReading: number;
      volume: number;
      cost: number;
      station: string | null;
      notes: string | null;
    },
  ) {
    if (!selectedVehicleId) return;
    handle(() => updateFuelRecord(recordId, selectedVehicleId, patch), () => {});
  }

  function handleDeleteFuelRecord(recordId: string) {
    if (!selectedVehicleId) return;
    handle(() => deleteFuelRecord(recordId, selectedVehicleId), () => {});
  }

  function handleMarkReminderDone(ruleId: string) {
    if (!selectedVehicleId) return;
    handle(() => markReminderDone(ruleId, selectedVehicleId), () => {});
  }

  function handleDeleteReminderRule(ruleId: string) {
    if (!selectedVehicleId) return;
    handle(() => deleteReminderRule(ruleId, selectedVehicleId), () => {});
  }

  function handleAdvancePlanCard(cardId: string, nextStage: PlanCardStage) {
    if (!selectedVehicleId) return;
    handle(() => updatePlanCardApi(cardId, selectedVehicleId, { stage: nextStage }), () => {});
  }

  function handleDeletePlanCard(cardId: string) {
    if (!selectedVehicleId) return;
    handle(() => deletePlanCard(cardId, selectedVehicleId), () => {});
  }

  if (!identity) {
    return (
      <AuthScreen
        email={email}
        onEmailChange={setEmail}
        onSignUpPasskey={() => handleAuthAction(() => registerWithPasskey(email), setIdentity)}
        onSignInPasskey={() => handleAuthAction(loginWithPasskey, setIdentity)}
        onSendMagicLink={() =>
          handleAuthAction(() => requestMagicLink(email), () => setMagicLinkSent(true))}
        pending={authPending}
        magicLinkSent={magicLinkSent}
        magicLinkOutcome={magicLinkOutcome}
        oidcOutcome={oidcOutcome}
        googleSignInUrl={GOOGLE_SIGN_IN_URL}
        error={error}
      />
    );
  }

  if (view === "dashboard") {
    return (
      <AppShell
        title={t("dashboardHeading")}
        view={view}
        onSelectView={setView}
        reviewBadgeCount={rejectedActionCount}
      >
        <DashboardView
          vehicles={mergedVehicles}
          onSelectVehicle={(id) => {
            setSelectedVehicleId(id);
            setView("garage");
          }}
        />
      </AppShell>
    );
  }

  if (view === "review") {
    return (
      <AppShell
        title={t("syncReviewHeading")}
        view={view}
        onSelectView={setView}
        reviewBadgeCount={rejectedActionCount}
      >
        <SyncReviewScreen actions={queueSnapshot.actions} />
      </AppShell>
    );
  }

  if (view === "settings") {
    return (
      <AppShell
        title={t("settingsScreenHeading")}
        view={view}
        onSelectView={setView}
        reviewBadgeCount={rejectedActionCount}
      >
        <SettingsView
          onError={() => setError(t("genericError"))}
          onConfirmDelete={handleDeleteAccount}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      title={t("vehiclesHeading")}
      view={view}
      onSelectView={setView}
      reviewBadgeCount={rejectedActionCount}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ font: "400 11.5px var(--font-mono)", color: "var(--dim)" }}>
            {t("signedInAs", { tenantId: identity.tenantId ?? "" })}
          </span>
          <SyncStatusIndicator
            snapshot={queueSnapshot}
            onOpenReview={() => setView("review")}
          />
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

        <SearchBar onSelectVehicle={(id) => setSelectedVehicleId(id)} />

        <Garage
          vehicles={mergedVehicles}
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={(id) => setSelectedVehicleId(selectedVehicleId === id ? null : id)}
          vehicleName={vehicleName}
          onVehicleNameChange={setVehicleName}
          vehicleOdometerUnit={vehicleOdometerUnit}
          onVehicleOdometerUnitChange={setVehicleOdometerUnit}
          vehicleVin={vehicleVin}
          onVehicleVinChange={(value) => {
            setVehicleVin(value);
            setVinLookupNotFound(false);
          }}
          vehicleMake={vehicleMake}
          onVehicleMakeChange={setVehicleMake}
          vehicleModel={vehicleModel}
          onVehicleModelChange={setVehicleModel}
          vehicleYear={vehicleYear}
          onVehicleYearChange={setVehicleYear}
          vinLookupPending={vinLookupPending}
          onLookupVin={handleLookupVin}
          vinLookupNotFound={vinLookupNotFound}
          onAddVehicle={() =>
            handle(
              () =>
                createVehicle({
                  name: vehicleName,
                  odometerUnit: vehicleOdometerUnit,
                  make: vehicleMake || null,
                  model: vehicleModel || null,
                  year: vehicleYear.trim() ? Number(vehicleYear) : null,
                  vin: vehicleVin || null,
                }),
              () => {
                vinLookupFormGeneration.current += 1;
                setVehicleName("");
                setVehicleVin("");
                setVehicleMake("");
                setVehicleModel("");
                setVehicleYear("");
                setVinLookupNotFound(false);
              },
            )}
        />

        {selectedVehicleId && (
          <div>
            <h2 style={{ font: "600 14px var(--font-ui)", letterSpacing: "-.01em" }}>
              {t("serviceRecordsHeading")}
            </h2>
            <ServiceRecordPanel
              records={mergedServiceRecords}
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
                  () => {
                    setServiceDate("");
                    setServiceDescription("");
                  },
                )}
              onUploadAttachment={handleUploadAttachment}
              attachmentsByRecordId={attachmentsByRecordId}
              onDismissDuplicate={handleDismissServiceDuplicate}
              onUpdateRecord={handleUpdateServiceRecord}
              onDeleteRecord={handleDeleteServiceRecord}
            />

            <h2
              style={{
                font: "600 14px var(--font-ui)",
                letterSpacing: "-.01em",
                marginTop: 20,
              }}
            >
              {t("fuelRecordsHeading")}
            </h2>
            <FuelRecordPanel
              records={mergedFuelRecords}
              fuelDate={fuelDate}
              onFuelDateChange={setFuelDate}
              odometerReading={fuelOdometerReading}
              onOdometerReadingChange={setFuelOdometerReading}
              volume={fuelVolume}
              onVolumeChange={setFuelVolume}
              cost={fuelCost}
              onCostChange={setFuelCost}
              onAddRecord={() =>
                handle(
                  () =>
                    createFuelRecord(selectedVehicleId, {
                      fuelDate,
                      odometerReading: Number(fuelOdometerReading),
                      volume: Number(fuelVolume),
                      cost: Number(fuelCost),
                    }),
                  () => {
                    setFuelDate("");
                    setFuelOdometerReading("");
                    setFuelVolume("");
                    setFuelCost("");
                  },
                )}
              onUploadAttachment={handleUploadFuelAttachment}
              attachmentsByRecordId={fuelAttachmentsByRecordId}
              onDismissDuplicate={handleDismissFuelDuplicate}
              onUpdateRecord={handleUpdateFuelRecord}
              onDeleteRecord={handleDeleteFuelRecord}
            />

            <h2
              style={{
                font: "600 14px var(--font-ui)",
                letterSpacing: "-.01em",
                marginTop: 20,
              }}
            >
              {t("reminderRulesHeading")}
            </h2>
            <ReminderRulePanel
              rules={mergedReminderRules}
              label={reminderLabel}
              onLabelChange={setReminderLabel}
              intervalDays={reminderIntervalDays}
              onIntervalDaysChange={setReminderIntervalDays}
              intervalDistance={reminderIntervalDistance}
              onIntervalDistanceChange={setReminderIntervalDistance}
              lastDoneDate={reminderLastDoneDate}
              onLastDoneDateChange={setReminderLastDoneDate}
              lastDoneOdometer={reminderLastDoneOdometer}
              onLastDoneOdometerChange={setReminderLastDoneOdometer}
              onAddRule={() =>
                handle(
                  () =>
                    createReminderRule(selectedVehicleId, {
                      label: reminderLabel,
                      ...(reminderIntervalDays !== ""
                        ? { intervalDays: Number(reminderIntervalDays) }
                        : {}),
                      ...(reminderIntervalDistance !== ""
                        ? { intervalDistance: Number(reminderIntervalDistance) }
                        : {}),
                      ...(reminderLastDoneDate !== ""
                        ? { lastDoneDate: reminderLastDoneDate }
                        : {}),
                      ...(reminderLastDoneOdometer !== ""
                        ? { lastDoneOdometer: Number(reminderLastDoneOdometer) }
                        : {}),
                    }),
                  () => {
                    setReminderLabel("");
                    setReminderIntervalDays("");
                    setReminderIntervalDistance("");
                    setReminderLastDoneDate("");
                    setReminderLastDoneOdometer("");
                  },
                )}
              onMarkDone={handleMarkReminderDone}
              onDeleteRule={handleDeleteReminderRule}
            />

            <h2
              style={{
                font: "600 14px var(--font-ui)",
                letterSpacing: "-.01em",
                marginTop: 20,
              }}
            >
              {t("documentsHeading")}
            </h2>
            <DocumentPanel
              documents={documents}
              title={documentTitle}
              onTitleChange={setDocumentTitle}
              category={documentCategory}
              onCategoryChange={setDocumentCategory}
              onAddDocument={() =>
                handle(
                  () =>
                    createDocument(selectedVehicleId, {
                      title: documentTitle,
                      category: documentCategory,
                    }),
                  (created) => {
                    setDocuments((current) => [...current, created]);
                    setDocumentTitle("");
                  },
                )}
              onUploadAttachment={handleUploadDocumentAttachment}
              attachmentsByDocumentId={documentAttachmentsByDocumentId}
              onUpdateDocument={handleUpdateDocument}
              onDeleteDocument={handleDeleteDocument}
            />

            <h2
              style={{
                font: "600 14px var(--font-ui)",
                letterSpacing: "-.01em",
                marginTop: 20,
              }}
            >
              {t("planBoardHeading")}
            </h2>
            <PlanBoard
              cards={mergedPlanCards}
              title={planCardTitle}
              onTitleChange={setPlanCardTitle}
              targetDate={planCardTargetDate}
              onTargetDateChange={setPlanCardTargetDate}
              estimatedCost={planCardEstimatedCost}
              onEstimatedCostChange={setPlanCardEstimatedCost}
              urgent={planCardUrgent}
              onUrgentChange={setPlanCardUrgent}
              onAddCard={() =>
                handle(
                  () =>
                    createPlanCard(selectedVehicleId, {
                      title: planCardTitle,
                      ...(planCardTargetDate !== "" ? { targetDate: planCardTargetDate } : {}),
                      ...(planCardEstimatedCost !== ""
                        ? { estimatedCost: Number(planCardEstimatedCost) }
                        : {}),
                      ...(planCardUrgent ? { urgent: true } : {}),
                    }),
                  () => {
                    setPlanCardTitle("");
                    setPlanCardTargetDate("");
                    setPlanCardEstimatedCost("");
                    setPlanCardUrgent(false);
                  },
                )}
              onAdvanceCard={handleAdvancePlanCard}
              onDeleteCard={handleDeletePlanCard}
            />

            <h2
              style={{
                font: "600 14px var(--font-ui)",
                letterSpacing: "-.01em",
                marginTop: 20,
              }}
            >
              {t("expenseBreakdownHeading")}
            </h2>
            <ExpenseBreakdownPanel vehicleId={selectedVehicleId} />

            <a
              href={reportDownloadUrl(selectedVehicleId)}
              style={{
                display: "inline-flex",
                alignSelf: "flex-start",
                marginTop: 14,
                background: "transparent",
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-md)",
                padding: "10px 14px",
                color: "var(--fg)",
                font: "600 11.5px var(--font-ui)",
                textDecoration: "none",
              }}
            >
              {t("downloadReportLabel")}
            </a>
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
