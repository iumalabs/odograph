import { useEffect, useState } from "react";
import type { Vehicle } from "../vehicles";
import { getVehicleAggregates } from "../vehicle-aggregates";
import type { VehicleAggregates } from "../vehicle-aggregates";
import { listReminderRules } from "../reminder-rules";
import type { ReminderRule } from "../reminder-rules";
import { CarIcon, DashboardIcon } from "../design/icons";
import { t } from "../i18n/strings";

type DashboardViewProps = {
  vehicles: Vehicle[];
  onSelectVehicle: (id: string) => void;
  currencySymbol: string;
};

type VehicleSummary = {
  vehicle: Vehicle;
  aggregates: VehicleAggregates | null;
  needsAttention: boolean;
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

/** Only the two cost figures get a currency symbol — averageFuelEconomy is a consumption figure,
 * not money (specs/035 research.md). */
function formatCostFigure(value: number | null, symbol: string): string {
  return value !== null ? `${symbol}${value.toFixed(2)}` : t("fuelEconomyNotEnoughData");
}

// Fetches every vehicle's aggregates (spec 013) and reminder rules with status (spec 011) in
// parallel, per vehicle — no new server route (research.md: no batch endpoint at this scale).
// needsAttention is derived client-side from the already-computed `status` field, never a new
// aggregate computation of its own (research.md).
export function DashboardView(props: DashboardViewProps) {
  const { vehicles, onSelectVehicle, currencySymbol } = props;
  const [summaries, setSummaries] = useState<Record<string, VehicleSummary>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      vehicles.map(async (vehicle) => {
        const [aggregates, reminderRules] = await Promise.all([
          getVehicleAggregates(vehicle.id).catch(() => null),
          listReminderRules(vehicle.id).catch(() => [] as ReminderRule[]),
        ]);
        const needsAttention = reminderRules.some(
          (rule) => rule.status === "coming_up" || rule.status === "overdue",
        );
        return [vehicle.id, { vehicle, aggregates, needsAttention }] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setSummaries(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [vehicles]);

  if (vehicles.length === 0) {
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
        <span style={{ font: "500 12.5px var(--font-ui)" }}>{t("noVehiclesOnDashboard")}</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {vehicles.map((vehicle) => {
        const summary = summaries[vehicle.id];
        const aggregates = summary?.aggregates ?? null;
        const needsAttention = summary?.needsAttention ?? false;
        const spec = [vehicle.make, vehicle.model, vehicle.year ? String(vehicle.year) : null]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={vehicle.id}
            type="button"
            onClick={() => onSelectVehicle(vehicle.id)}
            style={{
              textAlign: "left",
              border: "1px solid var(--line)",
              background: "var(--panel)",
              borderRadius: "var(--radius-lg)",
              padding: 16,
              cursor: "pointer",
              color: "var(--fg)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <DashboardIcon size={16} />
              <span style={{ font: "600 20px var(--font-ui)", letterSpacing: "-.02em" }}>
                {vehicle.name}
              </span>
              {spec && (
                <span style={{ font: "400 11px var(--font-mono)", color: "var(--dim)" }}>
                  {spec}
                </span>
              )}
              <span
                style={{
                  marginLeft: "auto",
                  font: "500 10.5px var(--font-mono)",
                  border: `1px solid ${needsAttention ? "var(--warn)" : "var(--line)"}`,
                  borderRadius: "var(--radius-sm)",
                  padding: "4px 8px",
                  color: needsAttention ? "var(--warn)" : "var(--dim)",
                }}
              >
                {needsAttention ? t("needsAttention") : t("allGood")}
              </span>
            </div>

            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              <span style={chipStyle}>
                {t("costPerDistanceLabel")}:{" "}
                {formatCostFigure(aggregates?.costPerDistance ?? null, currencySymbol)}
              </span>
              <span style={chipStyle}>
                {t("costPerTimeLabel")}:{" "}
                {formatCostFigure(aggregates?.costPerTime ?? null, currencySymbol)}
              </span>
              <span style={chipStyle}>
                {t("averageFuelEconomyLabel")}:{" "}
                {formatFigure(aggregates?.averageFuelEconomy ?? null)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
