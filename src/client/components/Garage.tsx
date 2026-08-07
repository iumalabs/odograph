import type { Vehicle } from "../vehicles";
import type { WithSyncStatus } from "../offline/merge";
import { AddIcon, CarIcon } from "../design/icons";
import { t } from "../i18n/strings";

type GarageProps = {
  vehicles: WithSyncStatus<Vehicle>[];
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string) => void;
  vehicleName: string;
  onVehicleNameChange: (value: string) => void;
  vehicleOdometerUnit: "km" | "mi";
  onVehicleOdometerUnitChange: (value: "km" | "mi") => void;
  onAddVehicle: () => void;
};

const chipStyle = {
  font: "500 10.5px var(--font-mono)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-sm)",
  padding: "4px 8px",
  color: "var(--dim)",
};

// Extracted from App.tsx's vehicle list/form (spec 008 T011-T013). Only real Vehicle fields are
// shown — no fuel-consumption or next-service stats, since those aren't tracked at the vehicle
// level yet (constitution Principle IV: no invented data).
export function Garage(props: GarageProps) {
  const {
    vehicles,
    selectedVehicleId,
    onSelectVehicle,
    vehicleName,
    onVehicleNameChange,
    vehicleOdometerUnit,
    onVehicleOdometerUnitChange,
    onAddVehicle,
  } = props;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {vehicles.map((vehicle) => {
        const spec = [vehicle.make, vehicle.model, vehicle.year ? String(vehicle.year) : null]
          .filter(Boolean)
          .join(" ");
        const isSelected = selectedVehicleId === vehicle.id;
        return (
          <button
            key={vehicle.id}
            type="button"
            onClick={() => onSelectVehicle(vehicle.id)}
            style={{
              textAlign: "left",
              border: `1px solid ${isSelected ? "var(--acc)" : "var(--line)"}`,
              background: "var(--panel)",
              borderRadius: "var(--radius-lg)",
              padding: 16,
              cursor: "pointer",
              color: "var(--fg)",
              display: "flex",
              flexDirection: "column",
              gap: 9,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ font: "600 20px var(--font-ui)", letterSpacing: "-.02em" }}>
                {vehicle.name}
              </span>
              {spec && (
                <span style={{ font: "400 11px var(--font-mono)", color: "var(--dim)" }}>
                  {spec}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {vehicle.vin && <span style={chipStyle}>{vehicle.vin}</span>}
              <span style={chipStyle}>{vehicle.odometerUnit}</span>
              {vehicle.syncStatus === "pending" && (
                <span style={{ ...chipStyle, color: "var(--dim)" }}>
                  {t("pendingSyncLabel")}
                </span>
              )}
              {vehicle.syncStatus === "rejected" && (
                <span
                  style={{ ...chipStyle, color: "var(--warn)", borderColor: "var(--warn)" }}
                  title={vehicle.rejectReason ?? undefined}
                >
                  {t("rejectedSyncLabel")}
                </span>
              )}
            </div>
          </button>
        );
      })}

      {vehicles.length === 0 && (
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
          <span style={{ font: "500 12.5px var(--font-ui)" }}>{t("noVehiclesYet")}</span>
        </div>
      )}

      <div
        style={{
          border: "1px solid var(--line)",
          background: "var(--panel)",
          borderRadius: "var(--radius-lg)",
          padding: 16,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 160px" }}>
          <span
            style={{
              font: "400 9.5px var(--font-mono)",
              color: "var(--dim)",
              letterSpacing: ".08em",
            }}
          >
            {t("vehicleNameLabel")}
          </span>
          <input
            type="text"
            value={vehicleName}
            onChange={(event) => onVehicleNameChange(event.target.value)}
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              padding: "11px 12px",
              color: "var(--fg)",
              font: "500 14px var(--font-ui)",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            style={{
              font: "400 9.5px var(--font-mono)",
              color: "var(--dim)",
              letterSpacing: ".08em",
            }}
          >
            {t("vehicleOdometerUnitLabel")}
          </span>
          <select
            value={vehicleOdometerUnit}
            onChange={(event) => onVehicleOdometerUnitChange(event.target.value as "km" | "mi")}
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
            <option value="km">km</option>
            <option value="mi">mi</option>
          </select>
        </label>
        <button
          type="button"
          onClick={onAddVehicle}
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
          {t("addVehicle")}
        </button>
      </div>
    </div>
  );
}
