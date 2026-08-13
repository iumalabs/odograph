import type { Currency } from "../currency";
import { AccountDeletion } from "./AccountDeletion";
import { ApiTokens } from "./ApiTokens";
import { PushNotifications } from "./PushNotifications";
import { t } from "../i18n/strings";

type SettingsViewProps = {
  onError: () => void;
  onConfirmDelete: () => void;
  currency: Currency;
  onCurrencyChange: (value: Currency) => void;
};

// Consolidates the account-level controls that used to sit inline in the garage screen's
// account-controls row (specs/029-settings-screen) — a pure relocation, each component's own
// logic/state/API calls are untouched.
export function SettingsView(
  { onError, onConfirmDelete, currency, onCurrencyChange }: SettingsViewProps,
) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h2 style={{ font: "600 15px var(--font-ui)", margin: 0 }}>{t("settingsScreenHeading")}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            style={{
              font: "400 9.5px var(--font-mono)",
              color: "var(--dim)",
              letterSpacing: ".08em",
            }}
          >
            {t("currencySettingLabel")}
          </span>
          <select
            value={currency}
            onChange={(event) => onCurrencyChange(event.target.value as Currency)}
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              padding: "11px 12px",
              color: "var(--fg)",
              font: "500 14px var(--font-ui)",
              outline: "none",
            }}
          >
            <option value="USD">{t("currencyUsdLabel")}</option>
            <option value="EUR">{t("currencyEurLabel")}</option>
            <option value="KGS">{t("currencyKgsLabel")}</option>
            <option value="GBP">{t("currencyGbpLabel")}</option>
          </select>
        </label>
        <ApiTokens onError={onError} />
        <PushNotifications onError={onError} />
        <AccountDeletion onConfirmDelete={onConfirmDelete} />
      </div>
    </div>
  );
}
