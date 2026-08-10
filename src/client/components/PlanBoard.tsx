import type { PlanCard, PlanCardStage } from "../plan-cards";
import type { WithSyncStatus } from "../offline/merge";
import { AddIcon, AlertIcon, ServiceIcon } from "../design/icons";
import { t } from "../i18n/strings";

type PlanBoardProps = {
  cards: WithSyncStatus<PlanCard>[];
  title: string;
  onTitleChange: (value: string) => void;
  targetDate: string;
  onTargetDateChange: (value: string) => void;
  estimatedCost: string;
  onEstimatedCostChange: (value: string) => void;
  urgent: boolean;
  onUrgentChange: (value: boolean) => void;
  onAddCard: () => void;
  onAdvanceCard: (cardId: string, nextStage: PlanCardStage) => void;
  onDeleteCard: (cardId: string) => void;
};

const STAGE_ORDER: PlanCardStage[] = ["idea", "buy", "doing", "done"];

function stageLabel(stage: PlanCardStage): string {
  switch (stage) {
    case "idea":
      return t("planStageIdea");
    case "buy":
      return t("planStageBuy");
    case "doing":
      return t("planStageDoing");
    case "done":
      return t("planStageDone");
  }
}

function nextStage(stage: PlanCardStage): PlanCardStage | null {
  const i = STAGE_ORDER.indexOf(stage);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] ?? null : null;
}

const mono9 = { font: "400 9.5px var(--font-mono)", color: "var(--dim)", letterSpacing: ".08em" };

const cardStyle = {
  border: "1px solid var(--line)",
  background: "var(--panel2)",
  borderRadius: "var(--radius-md)",
  padding: "10px 12px",
  display: "flex",
  flexDirection: "column" as const,
  gap: 6,
};

// New per-vehicle panel (specs/025) — the fourth resource-scoped panel alongside
// ServiceRecordPanel/FuelRecordPanel/DocumentPanel, but the only one, besides those three,
// routed through the offline write queue (spec 020) rather than plain fetch, per the issue's
// explicit requirement.
export function PlanBoard(props: PlanBoardProps) {
  const {
    cards,
    title,
    onTitleChange,
    targetDate,
    onTargetDateChange,
    estimatedCost,
    onEstimatedCostChange,
    urgent,
    onUrgentChange,
    onAddCard,
    onAdvanceCard,
    onDeleteCard,
  } = props;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {cards.length === 0
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
            <span style={{ font: "500 12.5px var(--font-ui)" }}>{t("noPlanCardsYet")}</span>
          </div>
        )
        : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(160px, 1fr))",
              gap: 12,
              overflowX: "auto",
            }}
          >
            {STAGE_ORDER.map((stage) => {
              const stageCards = cards.filter((c) => c.stage === stage);
              const next = nextStage(stage);
              return (
                <div
                  key={stage}
                  style={{
                    border: "1px solid var(--line)",
                    background: "var(--panel)",
                    borderRadius: "var(--radius-lg)",
                    padding: 10,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <div style={mono9}>
                    {stageLabel(stage)} · {stageCards.length}
                  </div>
                  {stageCards.map((card) => {
                    return (
                      <div key={card.id} style={cardStyle}>
                        <div style={{ font: "500 12.5px var(--font-ui)" }}>
                          {card.title}
                        </div>
                        {(card.targetDate || card.estimatedCost != null) && (
                          <div style={{ font: "400 10.5px var(--font-mono)", color: "var(--dim)" }}>
                            {card.targetDate}
                            {card.targetDate && card.estimatedCost != null ? " · " : ""}
                            {card.estimatedCost != null ? card.estimatedCost : ""}
                          </div>
                        )}
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}
                        >
                          {card.urgent && (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                font: "500 9.5px var(--font-mono)",
                                color: "var(--warn)",
                                border: "1px solid var(--warn)",
                                borderRadius: "var(--radius-sm)",
                                padding: "2px 6px",
                              }}
                            >
                              <AlertIcon size={10} />
                              {t("planCardUrgentLabel")}
                            </span>
                          )}
                          {card.syncStatus === "pending" && (
                            <span
                              style={{
                                font: "500 9.5px var(--font-mono)",
                                color: "var(--dim)",
                                border: "1px solid var(--line)",
                                borderRadius: "var(--radius-sm)",
                                padding: "2px 6px",
                              }}
                            >
                              {t("pendingSyncLabel")}
                            </span>
                          )}
                          {card.syncStatus === "rejected" && (
                            <span
                              title={card.rejectReason ?? undefined}
                              style={{
                                font: "500 9.5px var(--font-mono)",
                                color: "var(--warn)",
                                border: "1px solid var(--warn)",
                                borderRadius: "var(--radius-sm)",
                                padding: "2px 6px",
                              }}
                            >
                              {t("rejectedSyncLabel")}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {next && (
                            <button
                              type="button"
                              onClick={() => onAdvanceCard(card.id, next)}
                              style={{
                                background: "var(--acc)",
                                color: "var(--on-acc)",
                                border: "1px solid var(--acc)",
                                borderRadius: "var(--radius-sm)",
                                padding: "4px 8px",
                                font: "600 10px var(--font-ui)",
                                cursor: "pointer",
                              }}
                            >
                              {t("advancePlanCard", { stage: stageLabel(next) })}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteCard(card.id)}
                            style={{
                              background: "transparent",
                              border: "1px solid var(--line)",
                              borderRadius: "var(--radius-sm)",
                              padding: "4px 8px",
                              color: "var(--dim)",
                              font: "500 10px var(--font-ui)",
                              cursor: "pointer",
                            }}
                          >
                            {t("deletePlanCard")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
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
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 200px" }}>
          <span style={mono9}>{t("planCardTitleLabel")}</span>
          <input
            type="text"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              padding: "11px 12px",
              color: "var(--fg)",
              font: "500 13.5px var(--font-ui)",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={mono9}>{t("planCardTargetDateLabel")}</span>
          <input
            type="date"
            value={targetDate}
            onChange={(event) => onTargetDateChange(event.target.value)}
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              padding: "11px 12px",
              color: "var(--fg)",
              font: "500 13.5px var(--font-mono)",
              outline: "none",
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={mono9}>{t("planCardEstimatedCostLabel")}</span>
          <input
            type="number"
            value={estimatedCost}
            onChange={(event) => onEstimatedCostChange(event.target.value)}
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              padding: "11px 12px",
              color: "var(--fg)",
              font: "500 13.5px var(--font-mono)",
              outline: "none",
              width: 100,
            }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 11 }}>
          <input
            type="checkbox"
            checked={urgent}
            onChange={(event) => onUrgentChange(event.target.checked)}
          />
          <span style={{ font: "500 11.5px var(--font-ui)", color: "var(--dim)" }}>
            {t("planCardUrgentLabel")}
          </span>
        </label>
        <button
          type="button"
          onClick={onAddCard}
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
          {t("addPlanCard")}
        </button>
      </div>
    </div>
  );
}
