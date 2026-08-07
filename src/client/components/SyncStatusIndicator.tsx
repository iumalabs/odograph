import { t } from "../i18n/strings";
import type { QueueSnapshot } from "../offline/queue";

type SyncStatusIndicatorProps = {
  snapshot: QueueSnapshot;
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
 * At-a-glance offline/pending/rejected/reauth indicator (FR-003, FR-012) — the full triage
 * experience for rejected actions is a separate feature (issue #21); this only guarantees the
 * user can tell something needs attention without opening any per-record detail.
 */
export function SyncStatusIndicator({ snapshot }: SyncStatusIndicatorProps) {
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
        <span style={{ ...badgeStyle, color: "var(--warn)", borderColor: "var(--warn)" }}>
          {t("rejectedSyncCountLabel", { count: String(rejectedCount) })}
        </span>
      )}
    </span>
  );
}
