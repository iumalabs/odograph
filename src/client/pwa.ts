// Only the production build has a service worker to register at all (devOptions.enabled defaults
// to false for vite-plugin-pwa, and deno task dev's own CSP-skip logic already treats "development"
// as a distinct, non-production-shaped environment — specs/015-csp-nonces/research.md).
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js");
}
