import { AccountDeletion } from "./AccountDeletion";
import { ApiTokens } from "./ApiTokens";
import { PushNotifications } from "./PushNotifications";
import { t } from "../i18n/strings";

type SettingsViewProps = {
  onError: () => void;
  onConfirmDelete: () => void;
};

// Consolidates the account-level controls that used to sit inline in the garage screen's
// account-controls row (specs/029-settings-screen) — a pure relocation, each component's own
// logic/state/API calls are untouched.
export function SettingsView({ onError, onConfirmDelete }: SettingsViewProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ font: "600 15px var(--font-ui)", margin: 0 }}>{t("settingsScreenHeading")}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
        <ApiTokens onError={onError} />
        <PushNotifications onError={onError} />
        <AccountDeletion onConfirmDelete={onConfirmDelete} />
      </div>
    </div>
  );
}
