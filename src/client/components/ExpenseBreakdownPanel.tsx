import { useEffect, useState } from "react";
import type { ExpenseGroupBy, ExpensePeriod } from "../vehicle-aggregates";
import { getVehicleExpenseBreakdown } from "../vehicle-aggregates";
import { ServiceIcon } from "../design/icons";
import { t } from "../i18n/strings";

type ExpenseBreakdownPanelProps = {
  vehicleId: string;
  currencySymbol: string;
};

const mono9 = { font: "400 9.5px var(--font-mono)", color: "var(--dim)", letterSpacing: ".08em" };

function toggleButtonStyle(active: boolean) {
  return {
    background: active ? "var(--acc)" : "transparent",
    color: active ? "var(--on-acc)" : "var(--dim)",
    border: `1px solid ${active ? "var(--acc)" : "var(--line)"}`,
    borderRadius: "var(--radius-sm)",
    padding: "6px 10px",
    font: "600 10.5px var(--font-ui)",
    cursor: "pointer",
  };
}

function formatCost(value: number, symbol: string): string {
  return `${symbol}${value.toFixed(2)}`;
}

// Read-only — no writes, so this panel (unlike ServiceRecordPanel/PlanBoard) has no offline-queue
// interaction at all; a plain fetch on vehicle selection and on groupBy toggle is sufficient
// (specs/026 plan.md).
export function ExpenseBreakdownPanel(props: ExpenseBreakdownPanelProps) {
  const { vehicleId, currencySymbol } = props;
  const [groupBy, setGroupBy] = useState<ExpenseGroupBy>("month");
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  // Distinct from `periods.length === 0`: that's also true for the entire fetch's pending
  // window, which would otherwise flash "No spending recorded yet." on every navigation, not
  // just a genuinely empty account (issue #248).
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    getVehicleExpenseBreakdown(vehicleId, groupBy).then((result) => {
      if (cancelled) return;
      setPeriods(result);
      setLoaded(true);
    }).catch(() => {
      if (cancelled) return;
      setPeriods([]);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [vehicleId, groupBy]);

  const maxTotal = Math.max(0, ...periods.map((p) => p.totalCost));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          onClick={() => setGroupBy("month")}
          style={toggleButtonStyle(groupBy === "month")}
        >
          {t("expenseGroupByMonth")}
        </button>
        <button
          type="button"
          onClick={() => setGroupBy("year")}
          style={toggleButtonStyle(groupBy === "year")}
        >
          {t("expenseGroupByYear")}
        </button>
      </div>

      {!loaded
        ? (
          <div
            style={{
              border: "1px dashed var(--line)",
              borderRadius: "var(--radius-lg)",
              padding: 18,
              color: "var(--dim)",
              font: "500 12.5px var(--font-ui)",
            }}
          >
            {t("viewLoadingLabel")}
          </div>
        )
        : periods.length === 0
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
              <ServiceIcon size={18} />
            </div>
            <span style={{ font: "500 12.5px var(--font-ui)" }}>{t("noExpenseDataYet")}</span>
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto auto",
                gap: 10,
                padding: "10px 14px",
                borderBottom: "1px solid var(--line)",
                ...mono9,
              }}
            >
              <span>{t("expensePeriodLabel")}</span>
              <span>{t("expenseMaintenanceLabel")}</span>
              <span>{t("expenseFuelLabel")}</span>
              <span>{t("expenseTotalLabel")}</span>
            </div>
            {periods.map((period) => (
              <div
                key={period.period}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                <div>
                  <div style={{ font: "500 12.5px var(--font-mono)" }}>{period.period}</div>
                  {maxTotal > 0 && (
                    <div
                      style={{
                        marginTop: 4,
                        height: 4,
                        borderRadius: 2,
                        background: "var(--panel2)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${(period.totalCost / maxTotal) * 100}%`,
                          background: "var(--acc)",
                        }}
                      />
                    </div>
                  )}
                </div>
                <span style={{ font: "400 12px var(--font-mono)", color: "var(--dim)" }}>
                  {formatCost(period.maintenanceCost, currencySymbol)}
                </span>
                <span style={{ font: "400 12px var(--font-mono)", color: "var(--dim)" }}>
                  {formatCost(period.fuelCost, currencySymbol)}
                </span>
                <span style={{ font: "600 12px var(--font-mono)" }}>
                  {formatCost(period.totalCost, currencySymbol)}
                </span>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
