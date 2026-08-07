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
