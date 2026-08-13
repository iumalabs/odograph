import { useEffect, useState } from "react";
import type { Vehicle } from "../vehicles";
import { getVehicleAggregates, getVehicleExpenseBreakdown } from "../vehicle-aggregates";
import type { ExpensePeriod, VehicleAggregates } from "../vehicle-aggregates";
import { listReminderRules } from "../reminder-rules";
import type { ReminderRule } from "../reminder-rules";
import { listServiceRecords } from "../service-records";
import { listFuelRecords } from "../fuel-records";
import { convertDistance } from "../distance";
import type { DistanceUnit } from "../distance";
import { CarIcon, DashboardIcon } from "../design/icons";
import { t } from "../i18n/strings";

type DashboardViewProps = {
  vehicle: Vehicle | null;
  currencySymbol: string;
  /** Header display preference (specs/047) — independent of vehicle.odometerUnit, which stays the
   * unit the underlying remainingValue is actually expressed in until converted below. */
  distanceUnit: DistanceUnit;
};

type RecentEntry = { date: string; title: string; cost: number | null };

type DashboardData = {
  aggregates: VehicleAggregates | null;
  periods: ExpensePeriod[];
  reminders: ReminderRule[];
  recent: RecentEntry[];
};

const chipStyle = {
  font: "500 10.5px var(--font-mono)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-sm)",
  padding: "4px 8px",
  color: "var(--dim)",
};

function formatFigure(value: number | null): string {
  return value !== null ? value.toFixed(2) : t("fuelEconomyNotEnoughData");
}

/** Only cost figures get a currency symbol — averageFuelEconomy is a consumption figure, not
 * money (specs/035 research.md). */
function formatCostFigure(value: number | null, symbol: string): string {
  return value !== null ? `${symbol}${value.toFixed(2)}` : t("fuelEconomyNotEnoughData");
}

/** Formats a reminder's server-computed remaining value/unit (specs/043) into due-in text — all
 * wording lives here in strings.ts templates, never a server-formatted sentence (constitution
 * Principle IX). `Math.abs` because the sign is already conveyed by which template is chosen. */
function dueInText(
  rule: ReminderRule,
  vehicleOdometerUnit: DistanceUnit,
  distanceUnit: DistanceUnit,
): string | null {
  if (rule.remainingValue === null || rule.remainingUnit === null) return null;
  const overdue = rule.status === "overdue";
  if (rule.remainingUnit === "days") {
    const value = String(Math.round(Math.abs(rule.remainingValue)));
    return overdue
      ? t("reminderOverdueDaysLabel", { value })
      : t("reminderDueInDaysLabel", { value });
  }
  const converted = convertDistance(rule.remainingValue, vehicleOdometerUnit, distanceUnit);
  const value = String(Math.round(Math.abs(converted)));
  return overdue
    ? t("reminderOverdueDistanceLabel", { value, unit: distanceUnit })
    : t("reminderDueInDistanceLabel", { value, unit: distanceUnit });
}

/** The last 6 calendar months ending at the current one, as "YYYY-MM" keys — display-only, never
 * stored or used for any business decision (specs/037 research.md). */
function lastSixMonthKeys(): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

/** Overdue outranks coming-up; on_track/not_enough_data never qualify — same ranking as
 * Garage.tsx's mostUrgentReminder, applied here to a capped list instead of a single value
 * (specs/037 research.md: not worth extracting yet, still simple enough at two call sites). */
function upcomingReminders(rules: ReminderRule[]): ReminderRule[] {
  const rank = (rule: ReminderRule) => rule.status === "overdue" ? 0 : 1;
  return rules
    .filter((rule) => rule.status === "coming_up" || rule.status === "overdue")
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, 5);
}

// Deep-dive into whichever ONE vehicle is currently selected (specs/037) — matches the design
// prototype's actual "Дашборд" screen. Deliberately replaces, not duplicates, the previous
// all-vehicles-overview behavior: Garage's own cards (specs/034) already show each vehicle's
// current odometer and most-urgent-reminder at a glance.
export function DashboardView({ vehicle, currencySymbol, distanceUnit }: DashboardViewProps) {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    if (!vehicle) {
      setData(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      getVehicleAggregates(vehicle.id, distanceUnit).catch(() => null),
      getVehicleExpenseBreakdown(vehicle.id, "month").catch(() => [] as ExpensePeriod[]),
      listReminderRules(vehicle.id).catch(() => [] as ReminderRule[]),
      listServiceRecords(vehicle.id).catch(() => []),
      listFuelRecords(vehicle.id, distanceUnit).catch(() => []),
    ]).then(([aggregates, periods, reminders, serviceRecords, fuelRecords]) => {
      if (cancelled) return;
      const recent: RecentEntry[] = [
        ...serviceRecords.map((r) => ({
          date: r.serviceDate,
          title: r.description,
          cost: r.cost,
        })),
        ...fuelRecords.map((r) => ({
          date: r.fuelDate,
          title: r.station ?? t("fuelRecordsHeading"),
          cost: r.cost as number | null,
        })),
      ]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
        .slice(0, 5);
      setData({ aggregates, periods, reminders, recent });
    });
    return () => {
      cancelled = true;
    };
  }, [vehicle?.id, distanceUnit]);

  if (!vehicle) {
    return (
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
          <CarIcon size={18} />
        </div>
        <span style={{ font: "500 12.5px var(--font-ui)" }}>
          {t("selectVehicleForDashboard")}
        </span>
      </div>
    );
  }

  const periods = data?.periods ?? [];
  const totals = periods.reduce(
    (acc, p) => ({
      maintenanceCost: acc.maintenanceCost + p.maintenanceCost,
      fuelCost: acc.fuelCost + p.fuelCost,
      totalCost: acc.totalCost + p.totalCost,
    }),
    { maintenanceCost: 0, fuelCost: 0, totalCost: 0 },
  );
  const chartMonths = lastSixMonthKeys().map((period) => {
    const found = periods.find((p) => p.period === period);
    return {
      period,
      maintenanceCost: found?.maintenanceCost ?? 0,
      fuelCost: found?.fuelCost ?? 0,
    };
  });
  const maxMonthTotal = Math.max(
    1,
    ...chartMonths.map((m) => m.maintenanceCost + m.fuelCost),
  );
  const reminders = upcomingReminders(data?.reminders ?? []);
  const recent = data?.recent ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <DashboardIcon size={16} />
        <span style={{ font: "600 20px var(--font-ui)", letterSpacing: "-.02em" }}>
          {vehicle.name}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
        }}
      >
        <div
          style={{
            border: "1px solid var(--line)",
            background: "var(--panel)",
            borderRadius: "var(--radius-lg)",
            padding: 15,
          }}
        >
          <div style={{ font: "400 9.5px var(--font-mono)", color: "var(--dim)" }}>
            {t("expenseTotalLabel")}
          </div>
          <div style={{ font: "500 22px var(--font-mono)", marginTop: 8 }}>
            {formatCostFigure(totals.totalCost, currencySymbol)}
          </div>
        </div>
        <div
          style={{
            border: "1px solid var(--line)",
            background: "var(--panel)",
            borderRadius: "var(--radius-lg)",
            padding: 15,
          }}
        >
          <div style={{ font: "400 9.5px var(--font-mono)", color: "var(--dim)" }}>
            {t("expenseFuelLabel")}
          </div>
          <div style={{ font: "500 22px var(--font-mono)", marginTop: 8 }}>
            {formatCostFigure(totals.fuelCost, currencySymbol)}
          </div>
        </div>
        <div
          style={{
            border: "1px solid var(--line)",
            background: "var(--panel)",
            borderRadius: "var(--radius-lg)",
            padding: 15,
          }}
        >
          <div style={{ font: "400 9.5px var(--font-mono)", color: "var(--dim)" }}>
            {t("expenseMaintenanceLabel")}
          </div>
          <div style={{ font: "500 22px var(--font-mono)", marginTop: 8 }}>
            {formatCostFigure(totals.maintenanceCost, currencySymbol)}
          </div>
        </div>
        <div
          style={{
            border: "1px solid var(--acc)",
            background: "var(--panel)",
            borderRadius: "var(--radius-lg)",
            padding: 15,
          }}
        >
          <div style={{ font: "400 9.5px var(--font-mono)", color: "var(--dim)" }}>
            {t("costPerDistanceLabel")}
          </div>
          <div style={{ font: "500 22px var(--font-mono)", marginTop: 8, color: "var(--acc)" }}>
            {formatCostFigure(data?.aggregates?.costPerDistance ?? null, currencySymbol)}
          </div>
        </div>
      </div>

      <div
        style={{
          border: "1px solid var(--line)",
          background: "var(--panel)",
          borderRadius: "var(--radius-lg)",
          padding: 16,
          display: "flex",
          alignItems: "flex-end",
          gap: 10,
          height: 160,
        }}
      >
        {chartMonths.map((m) => {
          const total = m.maintenanceCost + m.fuelCost;
          const heightPct = (total / maxMonthTotal) * 100;
          const fuelSharePct = total > 0 ? (m.fuelCost / total) * 100 : 0;
          return (
            <div
              key={m.period}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                height: "100%",
                justifyContent: "flex-end",
              }}
            >
              <span style={{ font: "400 9.5px var(--font-mono)", color: "var(--dim)" }}>
                {formatCostFigure(total, currencySymbol)}
              </span>
              <div
                style={{
                  width: "100%",
                  height: `${heightPct}%`,
                  minHeight: total > 0 ? 3 : 0,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "flex-end",
                  background: "var(--panel2)",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{ height: `${fuelSharePct}%`, background: "var(--acc)" }}
                />
                <div
                  style={{ height: `${100 - fuelSharePct}%`, background: "var(--acc2)" }}
                />
              </div>
              <span style={{ font: "400 9.5px var(--font-mono)", color: "var(--dim)" }}>
                {m.period.slice(5)}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div
          style={{
            border: "1px solid var(--line)",
            background: "var(--panel)",
            borderRadius: "var(--radius-lg)",
            padding: "15px 16px",
          }}
        >
          <div style={{ font: "600 12.5px var(--font-ui)", marginBottom: 12 }}>
            {t("upcomingRemindersHeading")}
          </div>
          {reminders.length === 0
            ? (
              <span style={{ font: "400 11.5px var(--font-mono)", color: "var(--dim)" }}>
                {t("noUpcomingReminders")}
              </span>
            )
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {reminders.map((rule) => (
                  <div
                    key={rule.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      font: "400 11.5px var(--font-mono)",
                    }}
                  >
                    <span
                      style={{
                        color: rule.status === "overdue" ? "var(--warn)" : "var(--fg)",
                      }}
                    >
                      {rule.label}
                    </span>
                    <span
                      style={{ flex: 1, borderBottom: "1px dotted var(--line)" }}
                    />
                    <span
                      style={{
                        color: rule.status === "overdue" ? "var(--warn)" : "var(--fg)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {dueInText(rule, vehicle.odometerUnit, distanceUnit)}
                    </span>
                  </div>
                ))}
              </div>
            )}
        </div>
        <div
          style={{
            border: "1px solid var(--line)",
            background: "var(--panel)",
            borderRadius: "var(--radius-lg)",
            padding: "15px 16px",
          }}
        >
          <div style={{ font: "600 12.5px var(--font-ui)", marginBottom: 12 }}>
            {t("recentActivityHeading")}
          </div>
          {recent.length === 0
            ? (
              <span style={{ font: "400 11.5px var(--font-mono)", color: "var(--dim)" }}>
                {t("noRecentActivityYet")}
              </span>
            )
            : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {recent.map((entry, index) => (
                  <div
                    key={`${entry.date}-${index}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      font: "400 11.5px var(--font-mono)",
                    }}
                  >
                    <span style={{ color: "var(--dim)", flex: "none" }}>{entry.date}</span>
                    <span
                      style={{
                        overflow: "hidden",
                        whiteSpace: "nowrap",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {entry.title}
                    </span>
                    <span style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
                      {formatCostFigure(entry.cost, currencySymbol)}
                    </span>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        <span style={chipStyle}>
          {t("averageFuelEconomyLabel")}:{" "}
          {formatFigure(data?.aggregates?.averageFuelEconomy ?? null)}
        </span>
      </div>
    </div>
  );
}
