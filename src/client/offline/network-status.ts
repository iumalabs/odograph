// `navigator.onLine` is a trigger to attempt a drain, never proof a request will actually
// succeed (research.md) — a Wi-Fi network with no real upstream still reports `true`. The drain
// loop's own fetch failure handling is what actually governs retry/backoff; this module only
// decides *when to try*.

type Listener = (online: boolean) => void;

const listeners = new Set<Listener>();

function currentlyOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("online", () => {
    for (const listener of listeners) listener(true);
  });
  globalThis.addEventListener("offline", () => {
    for (const listener of listeners) listener(false);
  });
}

export function isOnline(): boolean {
  return currentlyOnline();
}

export function subscribeNetworkStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
