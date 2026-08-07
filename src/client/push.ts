import { fromBase64Url } from "web-push-browser";

export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export type SubscribeOutcome =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "permission_denied" | "unavailable" };

async function fetchVapidPublicKey(): Promise<string | null> {
  const res = await fetch("/api/v1/push/vapid-public-key");
  if (!res.ok) return null;
  const body = (await res.json()) as { publicKey: string };
  return body.publicKey;
}

/**
 * Requests notification permission and registers this device for reminder push notifications
 * (FR-002). Never throws — a distinct `reason` on failure so the caller can show *why* rather than
 * a generic error (FR-003).
 */
export async function subscribeToPush(): Promise<SubscribeOutcome> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) return { ok: false, reason: "unavailable" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "permission_denied" };

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: fromBase64Url(publicKey),
  });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: "unavailable" };
  }

  const res = await fetch("/api/v1/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });
  if (!res.ok) return { ok: false, reason: "unavailable" };

  return { ok: true };
}

/** Unsubscribes this device both browser-side and server-side (FR-006). A no-op if never subscribed. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await fetch("/api/v1/push/subscriptions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

export type PushStatus = "enabled" | "disabled" | "unsupported";

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return "unsupported";
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? "enabled" : "disabled";
}
