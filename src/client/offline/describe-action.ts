import { t } from "../i18n/strings";
import type { PendingAction } from "./types";

const ENTITY_LABEL_KEY = {
  vehicle: "entityVehicleLabel",
  serviceRecord: "entityServiceRecordLabel",
  fuelRecord: "entityFuelRecordLabel",
  reminderRule: "entityReminderRuleLabel",
} as const;

const ACTION_LABEL_KEY = {
  create: "actionCreateLabel",
  update: "actionUpdateLabel",
  delete: "actionDeleteLabel",
  dismissDuplicate: "actionDismissDuplicateLabel",
  markDone: "actionMarkDoneLabel",
} as const;

/**
 * A recognizable field from the action's own body, where one exists — delete/dismissDuplicate/
 * markDone act on an existing id, not a fresh payload, so there's nothing further to show for
 * those beyond the entity/action-type phrase itself.
 */
function recognizableField(action: PendingAction): string | null {
  if (
    action.actionType === "delete" || action.actionType === "dismissDuplicate" ||
    action.actionType === "markDone"
  ) {
    return null;
  }
  const body = action.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") return null;

  const candidate = body.description ?? body.fuelDate ?? body.label ?? body.name;
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
}

/** Plain-language "what was attempted" for a queued action (FR-002). */
export function describeAction(action: PendingAction): string {
  const entityLabel = t(ENTITY_LABEL_KEY[action.entity]);
  const actionLabel = t(ACTION_LABEL_KEY[action.actionType]);
  const field = recognizableField(action);
  return field
    ? `${actionLabel} ${entityLabel.toLowerCase()} — ${field}`
    : `${actionLabel} ${entityLabel.toLowerCase()}`;
}
