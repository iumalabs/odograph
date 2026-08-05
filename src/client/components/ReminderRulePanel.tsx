import type { ReminderRule, ReminderStatus } from "../reminder-rules";
import { AddIcon, BellIcon } from "../design/icons";
import { t } from "../i18n/strings";

type ReminderRulePanelProps = {
  rules: ReminderRule[];
  label: string;
  onLabelChange: (value: string) => void;
  intervalDays: string;
  onIntervalDaysChange: (value: string) => void;
  intervalDistance: string;
  onIntervalDistanceChange: (value: string) => void;
  lastDoneDate: string;
  onLastDoneDateChange: (value: string) => void;
  lastDoneOdometer: string;
  onLastDoneOdometerChange: (value: string) => void;
  onAddRule: () => void;
  onMarkDone: (ruleId: string) => void;
  onDeleteRule: (ruleId: string) => void;
};

const mono9 = { font: "400 9.5px var(--font-mono)", color: "var(--dim)", letterSpacing: ".08em" };

const numberInputStyle = {
  background: "var(--panel2)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-md)",
  padding: "11px 12px",
  color: "var(--fg)",
  font: "500 14px var(--font-mono)",
  outline: "none",
  width: "100%",
  boxSizing: "border-box" as const,
};

// Status badge treatment (tasks.md T016): var(--warn) for overdue, var(--acc) for coming_up,
// var(--dim) for on_track (all solid borders), and a dashed border for not_enough_data — the same
// "distinct, never blank" idea as FuelRecordPanel's fuelEconomy "—" precedent (spec 009).
const STATUS_STYLE: Record<ReminderStatus, { color: string; border: string }> = {
  overdue: { color: "var(--warn)", border: "1px solid var(--warn)" },
  coming_up: { color: "var(--acc)", border: "1px solid var(--acc)" },
  on_track: { color: "var(--dim)", border: "1px solid var(--line)" },
  not_enough_data: { color: "var(--dim)", border: "1px dashed var(--line)" },
};

const STATUS_LABEL_KEY: Record<
  ReminderStatus,
  | "reminderStatusOnTrack"
  | "reminderStatusComingUp"
  | "reminderStatusOverdue"
  | "reminderStatusNotEnoughData"
> = {
  on_track: "reminderStatusOnTrack",
  coming_up: "reminderStatusComingUp",
  overdue: "reminderStatusOverdue",
  not_enough_data: "reminderStatusNotEnoughData",
};

function intervalSummary(rule: ReminderRule): string {
  const parts: string[] = [];
  if (rule.intervalDays != null) parts.push(`${rule.intervalDays}d`);
  if (rule.intervalDistance != null) parts.push(`${rule.intervalDistance}`);
  return parts.join(" / ");
}

// Mirrors FuelRecordPanel.tsx's list/empty-state/form structure (spec 008/009/011).
export function ReminderRulePanel(props: ReminderRulePanelProps) {
  const {
    rules,
    label,
    onLabelChange,
    intervalDays,
    onIntervalDaysChange,
    intervalDistance,
    onIntervalDistanceChange,
    lastDoneDate,
    onLastDoneDateChange,
    lastDoneOdometer,
    onLastDoneOdometerChange,
    onAddRule,
    onMarkDone,
    onDeleteRule,
  } = props;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {rules.length === 0
        ? (
          <div
            style={{
              border: "1px dashed var(--line)",
              borderRadius: "var(--radius-lg)",
              padding: 18,
              display: "flex",
              alignItems: "center",
              gap: 14,
              color: "var(--dim)",
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-md)",
                display: "grid",
                placeItems: "center",
                flex: "none",
              }}
            >
              <BellIcon size={18} />
            </div>
            <span style={{ font: "500 12.5px var(--font-ui)" }}>{t("noReminderRulesYet")}</span>
          </div>
        )
        : (
          <div
            style={{
              border: "1px solid var(--line)",
              background: "var(--panel)",
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
            }}
          >
            {rules.map((rule) => {
              const statusStyle = STATUS_STYLE[rule.status];
              return (
                <div
                  key={rule.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 9,
                    padding: "14px 18px",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: "500 13px var(--font-ui)" }}>{rule.label}</div>
                      <div
                        style={{
                          font: "400 10.5px var(--font-mono)",
                          color: "var(--dim)",
                          marginTop: 5,
                        }}
                      >
                        {intervalSummary(rule)}
                      </div>
                    </div>
                    <span
                      style={{
                        font: "500 10.5px var(--font-mono)",
                        color: statusStyle.color,
                        border: statusStyle.border,
                        borderRadius: "var(--radius-sm)",
                        padding: "4px 8px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t(STATUS_LABEL_KEY[rule.status])}
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => onMarkDone(rule.id)}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--line)",
                        borderRadius: "var(--radius-sm)",
                        padding: "4px 8px",
                        color: "var(--dim)",
                        font: "500 10.5px var(--font-mono)",
                        cursor: "pointer",
                      }}
                    >
                      {t("markReminderDone")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRule(rule.id)}
                      style={{
                        background: "transparent",
                        border: "1px solid var(--line)",
                        borderRadius: "var(--radius-sm)",
                        padding: "4px 8px",
                        color: "var(--dim)",
                        font: "500 10.5px var(--font-mono)",
                        cursor: "pointer",
                      }}
                    >
                      {t("deleteReminderRule")}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      <div
        style={{
          border: "1px solid var(--line)",
          background: "var(--panel)",
          borderRadius: "var(--radius-lg)",
          padding: "16px 18px",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={mono9}>{t("reminderLabelLabel")}</span>
          <input
            type="text"
            value={label}
            onChange={(event) => onLabelChange(event.target.value)}
            style={numberInputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={mono9}>{t("reminderIntervalDaysLabel")}</span>
          <input
            type="number"
            value={intervalDays}
            onChange={(event) => onIntervalDaysChange(event.target.value)}
            style={numberInputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={mono9}>{t("reminderLastDoneDateLabel")}</span>
          <input
            type="date"
            value={lastDoneDate}
            onChange={(event) => onLastDoneDateChange(event.target.value)}
            style={numberInputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={mono9}>{t("reminderIntervalDistanceLabel")}</span>
          <input
            type="number"
            value={intervalDistance}
            onChange={(event) => onIntervalDistanceChange(event.target.value)}
            style={numberInputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={mono9}>{t("reminderLastDoneOdometerLabel")}</span>
          <input
            type="number"
            value={lastDoneOdometer}
            onChange={(event) => onLastDoneOdometerChange(event.target.value)}
            style={numberInputStyle}
          />
        </label>
        <button
          type="button"
          onClick={onAddRule}
          style={{
            background: "var(--acc)",
            color: "var(--on-acc)",
            border: "1px solid var(--acc)",
            borderRadius: "var(--radius-md)",
            padding: "11px 14px",
            font: "600 11.5px var(--font-ui)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <AddIcon size={15} />
          {t("addReminderRule")}
        </button>
      </div>
    </div>
  );
}
