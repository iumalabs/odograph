import { t } from "../i18n/strings";
import type { QueueSnapshot } from "../offline/queue";

type SyncStatusIndicatorProps = {
  snapshot: QueueSnapshot;
  /** Navigates to the review screen (spec 021) — omit to render the rejected badge inert. */
  onOpenReview?: () => void;
};

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-sm)",
  padding: "4px 8px",
  font: "500 10.5px var(--font-mono)",
} as const;

/**
 * At-a-glance offline/pending/rejected/reauth indicator (spec 020 FR-003/FR-012). The rejected
 * badge doubles as the entry point into the full review screen (spec 021 FR-007/FR-008) when
 * `onOpenReview` is supplied.
 */
export function SyncStatusIndicator({ snapshot, onOpenReview }: SyncStatusIndicatorProps) {
  const pendingCount = snapshot.actions.filter((a) => a.status !== "rejected").length;
  const rejectedCount = snapshot.actions.filter((a) => a.status === "rejected").length;

  if (snapshot.needsReauth) {
    return (
      <span style={{ ...badgeStyle, color: "var(--warn)", borderColor: "var(--warn)" }}>
        {t("syncNeedsReauthLabel")}
      </span>
    );
  }

  if (!snapshot.online) {
    return (
      <span style={{ ...badgeStyle, color: "var(--dim)" }}>
        {t("offlineIndicatorLabel")}
        {pendingCount > 0 && ` — ${t("pendingSyncCountLabel", { count: String(pendingCount) })}`}
      </span>
    );
  }

  if (pendingCount === 0 && rejectedCount === 0) return null;

  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      {pendingCount > 0 && (
        <span style={{ ...badgeStyle, color: "var(--dim)" }}>
          {t("pendingSyncCountLabel", { count: String(pendingCount) })}
        </span>
      )}
      {rejectedCount > 0 && (
        onOpenReview
          ? (
            <button
              type="button"
              onClick={onOpenReview}
              style={{
                ...badgeStyle,
                color: "var(--warn)",
                borderColor: "var(--warn)",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              {t("rejectedSyncCountLabel", { count: String(rejectedCount) })}
            </button>
          )
          : (
            <span style={{ ...badgeStyle, color: "var(--warn)", borderColor: "var(--warn)" }}>
              {t("rejectedSyncCountLabel", { count: String(rejectedCount) })}
            </span>
          )
      )}
    </span>
  );
}
