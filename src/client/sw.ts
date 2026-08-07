import { clientsClaim } from "workbox-core";
import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// Precaches only the built JS/CSS/icon bundle (content-hashed, immutable per build) — deliberately
// no NavigationRoute, no setDefaultHandler, no fetch handling of any kind beyond this call. Every
// navigation request MUST reach the Worker over the network unconditionally, since it needs a
// fresh, single-use CSP nonce on every response (specs/015-csp-nonces) that a cached response could
// never carry correctly (specs/018-pwa-installability/research.md).
precacheAndRoute(self.__WB_MANIFEST);

// A newly deployed version takes over on the very next reload rather than waiting for every open
// tab of the previous version to close — this app has no in-flight client state a version
// transition could break (research.md).
self.skipWaiting();
clientsClaim();

// spec 022: web push reminder delivery. Neither listener touches the `fetch` path — showing a
// notification and reacting to a click are both independent of the precache-only, no-fetch-
// handling design above (specs/018's own constraint on this file is unaffected).
self.addEventListener("push", (event) => {
  const data = event.data?.json() as { title: string; body: string } | undefined;
  if (!data) return;
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) return existing.focus();
      return self.clients.openWindow("/");
    }),
  );
});
