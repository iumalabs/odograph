import { useEffect, useState } from "react";
import { getPushStatus, subscribeToPush, unsubscribeFromPush } from "../push";
import type { PushStatus } from "../push";
import { t } from "../i18n/strings";

type PushNotificationsProps = {
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

/** Opt-in toggle for reminder push notifications (spec 022), mirroring ApiTokens.tsx's shape and
 * placement in the account/settings area. */
export function PushNotifications({ onError }: PushNotificationsProps) {
  const [status, setStatus] = useState<PushStatus | "loading">("loading");
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    getPushStatus().then(setStatus).catch(() => setStatus("unsupported"));
  }, []);

  async function handleToggle() {
    if (status === "enabled") {
      await unsubscribeFromPush();
      setStatus("disabled");
      return;
    }

    const outcome = await subscribeToPush();
    if (outcome.ok) {
      setStatus("enabled");
      setPermissionDenied(false);
      return;
    }
    if (outcome.reason === "permission_denied") {
      setPermissionDenied(true);
      return;
    }
    if (outcome.reason === "unsupported") {
      setStatus("unsupported");
      return;
    }
    onError();
  }

  if (status === "loading") return null;

  if (status === "unsupported") {
    return (
      <span style={{ font: "400 11px var(--font-mono)", color: "var(--dim)" }}>
        {t("pushUnsupportedLabel")}
      </span>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button type="button" style={toggleStyle} onClick={handleToggle}>
        {status === "enabled" ? t("pushDisableLabel") : t("pushEnableLabel")}
      </button>
      {permissionDenied && (
        <span style={{ font: "400 10.5px var(--font-mono)", color: "var(--warn)" }}>
          {t("pushPermissionDeniedLabel")}
        </span>
      )}
    </div>
  );
}
