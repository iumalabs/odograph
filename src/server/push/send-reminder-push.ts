import { sendPushNotification } from "web-push-browser";

const VAPID_SUBJECT = "mailto:support@odograph.iuma.dev";

export type PushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type SendReminderPushResult =
  | { sent: true }
  | { sent: false; expired: boolean; error: string };

/**
 * Mirrors sendReminderDueEmail()'s exact contract (src/server/email/reminder-notification.ts):
 * never throws, always resolves to a sent/error result — evaluateAllReminders' per-row try/catch
 * relies on this. `expired: true` (a 404/410 from the push service) tells the caller the
 * subscription is gone for good and should be deleted (research.md) — any other failure (network
 * error, 5xx) is transient and the row is left alone to retry on the next sweep.
 *
 * Shared between evaluateAllReminders and evaluateAllDocumentReminders — see
 * reminder-notification.ts's identical note (specs/024 research.md).
 */
export async function sendReminderPushNotification(
  vapidKeys: CryptoKeyPair,
  subscription: PushSubscriptionInput,
  input: { vehicleName: string; itemLabel: string; status: "coming_up" | "overdue" },
): Promise<SendReminderPushResult> {
  const statusText = input.status === "overdue" ? "is overdue" : "is coming up";
  const payload = JSON.stringify({
    title: `${input.vehicleName}: ${input.itemLabel} ${statusText}`,
    body: `Your reminder "${input.itemLabel}" for ${input.vehicleName} ${statusText}.`,
  });

  try {
    const response = await sendPushNotification(
      vapidKeys,
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      VAPID_SUBJECT,
      payload,
    );
    if (response.ok) return { sent: true };
    const expired = response.status === 404 || response.status === 410;
    return { sent: false, expired, error: `push service responded ${response.status}` };
  } catch (error) {
    return {
      sent: false,
      expired: false,
      error: error instanceof Error ? error.message : "unknown_error",
    };
  }
}
