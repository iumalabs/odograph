import { useState } from "react";
import type { Attachment, FuelRecord } from "../fuel-records";
import { AddIcon, FuelIcon, ReceiptIcon, UploadIcon } from "../design/icons";
import { t } from "../i18n/strings";

type FuelRecordPanelProps = {
  records: FuelRecord[];
  fuelDate: string;
  onFuelDateChange: (value: string) => void;
  odometerReading: string;
  onOdometerReadingChange: (value: string) => void;
  volume: string;
  onVolumeChange: (value: string) => void;
  cost: string;
  onCostChange: (value: string) => void;
  onAddRecord: () => void;
  onUploadAttachment: (recordId: string, file: File) => Promise<void>;
  attachmentsByRecordId: Record<string, Attachment[]>;
  onDismissDuplicate: (recordId: string) => void;
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

// Mirrors ServiceRecordPanel.tsx's structure exactly (spec 008/009 T016) — the one genuinely new
// piece is the fuelEconomy column, rendered in var(--acc) when present or an explicit "—" in
// var(--dim) when null, never a blank cell (spec 009 research.md).
export function FuelRecordPanel(props: FuelRecordPanelProps) {
  const {
    records,
    fuelDate,
    onFuelDateChange,
    odometerReading,
    onOdometerReadingChange,
    volume,
    onVolumeChange,
    cost,
    onCostChange,
    onAddRecord,
    onUploadAttachment,
    attachmentsByRecordId,
    onDismissDuplicate,
  } = props;

  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const [justUploadedId, setJustUploadedId] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {records.length === 0
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
              <FuelIcon size={18} />
            </div>
            <span style={{ font: "500 12.5px var(--font-ui)" }}>{t("noFuelRecordsYet")}</span>
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
            {records.map((record) => {
              const attachments = attachmentsByRecordId[record.id] ?? [];
              return (
                <div
                  key={record.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 9,
                    padding: "14px 18px",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span
                      style={{
                        font: "400 12.5px var(--font-mono)",
                        color: "var(--dim)",
                        flex: "none",
                      }}
                    >
                      {record.fuelDate}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: "500 13px var(--font-ui)" }}>
                        {record.station ?? t("fuelStationLabel")}
                      </div>
                      {record.notes && (
                        <div
                          style={{
                            font: "400 10.5px var(--font-mono)",
                            color: "var(--dim)",
                            marginTop: 5,
                          }}
                        >
                          {record.notes}
                        </div>
                      )}
                    </div>
                    <span style={{ font: "400 12.5px var(--font-mono)", color: "var(--fg)" }}>
                      {record.odometerReading}
                    </span>
                    <span style={{ font: "400 12.5px var(--font-mono)", color: "var(--fg)" }}>
                      {record.volume}
                    </span>
                    <span style={{ font: "400 12.5px var(--font-mono)", color: "var(--fg)" }}>
                      {record.cost}
                    </span>
                    {record.duplicateOfId != null
                      ? (
                        <span
                          style={{
                            font: "500 10.5px var(--font-mono)",
                            color: "var(--warn)",
                            border: "1px solid var(--warn)",
                            borderRadius: "var(--radius-sm)",
                            padding: "4px 8px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {t("possibleDuplicateLabel")}
                        </span>
                      )
                      : (
                        <span
                          style={{
                            font: "500 12.5px var(--font-mono)",
                            color: record.fuelEconomy != null ? "var(--acc)" : "var(--dim)",
                            minWidth: 40,
                            textAlign: "right",
                          }}
                        >
                          {record.fuelEconomy != null
                            ? record.fuelEconomy.toFixed(1)
                            : t("fuelEconomyNotEnoughData")}
                        </span>
                      )}
                  </div>

                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
                    {record.duplicateOfId != null && (
                      <button
                        type="button"
                        onClick={() => onDismissDuplicate(record.id)}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--warn)",
                          borderRadius: "var(--radius-sm)",
                          padding: "4px 8px",
                          color: "var(--warn)",
                          font: "500 10.5px var(--font-mono)",
                          cursor: "pointer",
                        }}
                      >
                        {t("dismissDuplicate")}
                      </button>
                    )}
                    {attachments.map((attachment) => (
                      <span
                        key={attachment.id}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          font: "500 10.5px var(--font-mono)",
                          border: "1px solid var(--line)",
                          borderRadius: "var(--radius-sm)",
                          padding: "4px 8px",
                          color: "var(--dim)",
                        }}
                      >
                        <ReceiptIcon size={12} />
                        {Math.round(attachment.size / 1024)}KB
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setUploadTargetId(uploadTargetId === record.id ? null : record.id)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        background: "transparent",
                        border: "1px solid var(--line)",
                        borderRadius: "var(--radius-sm)",
                        padding: "4px 8px",
                        color: "var(--dim)",
                        font: "500 10.5px var(--font-mono)",
                        cursor: "pointer",
                      }}
                    >
                      <UploadIcon size={12} />
                      {t("attachmentUploadLabel")}
                    </button>
                    {uploadTargetId === record.id && (
                      <input
                        type="file"
                        onChange={async (event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          await onUploadAttachment(record.id, file);
                          setUploadTargetId(null);
                          setJustUploadedId(record.id);
                        }}
                      />
                    )}
                    {justUploadedId === record.id && (
                      <span
                        style={{
                          background: "var(--panel2)",
                          border: "1px solid var(--line)",
                          borderRadius: 9,
                          padding: "6px 10px",
                          font: "400 10.5px var(--font-mono)",
                          color: "var(--acc)",
                          animation: "tin .14s ease",
                        }}
                      >
                        {t("uploadAttachment")} ✓
                      </span>
                    )}
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
          <span style={mono9}>{t("fuelDateLabel")}</span>
          <input
            type="date"
            value={fuelDate}
            onChange={(event) => onFuelDateChange(event.target.value)}
            style={numberInputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={mono9}>{t("fuelOdometerLabel")}</span>
          <input
            type="number"
            value={odometerReading}
            onChange={(event) => onOdometerReadingChange(event.target.value)}
            style={numberInputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={mono9}>{t("fuelVolumeLabel")}</span>
          <input
            type="number"
            value={volume}
            onChange={(event) => onVolumeChange(event.target.value)}
            style={numberInputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={mono9}>{t("fuelCostLabel")}</span>
          <input
            type="number"
            value={cost}
            onChange={(event) => onCostChange(event.target.value)}
            style={numberInputStyle}
          />
        </label>
        <button
          type="button"
          onClick={onAddRecord}
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
          {t("addFuelRecord")}
        </button>
      </div>
    </div>
  );
}
