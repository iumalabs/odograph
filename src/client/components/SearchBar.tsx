import { useEffect, useState } from "react";
import { search } from "../search";
import type { RecordMatch, SearchResults, VehicleMatch } from "../search";
import { t } from "../i18n/strings";

type SearchBarProps = {
  onSelectVehicle: (vehicleId: string) => void;
};

const MIN_QUERY_LENGTH = 2;

const groupStyle = { display: "flex", flexDirection: "column" as const, gap: 6 };
const mono9 = { font: "400 9.5px var(--font-mono)", color: "var(--dim)", letterSpacing: ".08em" };

function resultRowStyle() {
  return {
    textAlign: "left" as const,
    background: "transparent",
    border: "1px solid var(--line)",
    borderRadius: "var(--radius-sm)",
    padding: "8px 10px",
    color: "var(--fg)",
    font: "500 12px var(--font-ui)",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column" as const,
    gap: 3,
  };
}

// Mounted at the garage level, not inside a selected vehicle's panels — the point of search is
// finding which vehicle to select next (specs/028 plan.md), unlike every other panel in this app.
export function SearchBar(props: SearchBarProps) {
  const { onSelectVehicle } = props;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);

  useEffect(() => {
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setResults(null);
      return;
    }
    let cancelled = false;
    search(query).then((found) => {
      if (!cancelled) setResults(found);
    }).catch(() => {
      if (!cancelled) setResults(null);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const hasAnyResults = results !== null && (
    results.vehicles.length > 0 ||
    results.serviceRecords.length > 0 ||
    results.fuelRecords.length > 0 ||
    results.documents.length > 0
  );

  function renderVehicle(match: VehicleMatch) {
    const spec = [match.make, match.model, match.year ? String(match.year) : null]
      .filter(Boolean)
      .join(" ");
    return (
      <button
        key={match.id}
        type="button"
        onClick={() => onSelectVehicle(match.id)}
        style={resultRowStyle()}
      >
        <span>{match.name}</span>
        {spec && (
          <span style={{ font: "400 10.5px var(--font-mono)", color: "var(--dim)" }}>{spec}</span>
        )}
      </button>
    );
  }

  function renderRecord(match: RecordMatch) {
    return (
      <button
        key={match.id}
        type="button"
        onClick={() => onSelectVehicle(match.vehicleId)}
        style={resultRowStyle()}
      >
        <span>{match.title || match.vehicleName}</span>
        <span style={{ font: "400 10.5px var(--font-mono)", color: "var(--dim)" }}>
          {match.vehicleName}
          {match.date ? ` · ${match.date}` : ""}
        </span>
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("searchPlaceholder")}
        style={{
          background: "var(--panel2)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius-md)",
          padding: "10px 12px",
          color: "var(--fg)",
          font: "500 13px var(--font-ui)",
          outline: "none",
          width: "100%",
          boxSizing: "border-box",
        }}
      />

      {query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH && (
        <span style={{ font: "400 11px var(--font-ui)", color: "var(--dim)" }}>
          {t("searchTooShort")}
        </span>
      )}

      {results !== null && !hasAnyResults && (
        <span style={{ font: "400 11px var(--font-ui)", color: "var(--dim)" }}>
          {t("searchNoResults")}
        </span>
      )}

      {results !== null && hasAnyResults && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {results.vehicles.length > 0 && (
            <div style={groupStyle}>
              <span style={mono9}>{t("searchVehiclesGroup")}</span>
              {results.vehicles.map(renderVehicle)}
            </div>
          )}
          {results.serviceRecords.length > 0 && (
            <div style={groupStyle}>
              <span style={mono9}>{t("searchServiceRecordsGroup")}</span>
              {results.serviceRecords.map(renderRecord)}
            </div>
          )}
          {results.fuelRecords.length > 0 && (
            <div style={groupStyle}>
              <span style={mono9}>{t("searchFuelRecordsGroup")}</span>
              {results.fuelRecords.map(renderRecord)}
            </div>
          )}
          {results.documents.length > 0 && (
            <div style={groupStyle}>
              <span style={mono9}>{t("searchDocumentsGroup")}</span>
              {results.documents.map(renderRecord)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
