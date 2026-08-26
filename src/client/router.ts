import { useEffect, useState } from "react";
import type { AppView } from "./components/AppShell";

// Minimal client-side router (specs/059 research.md Decision 1) — a flat set of known paths, no
// nested layouts, no URL parameters, so the History API directly (no routing library) covers it.

const VIEW_PATHS: Record<AppView, string> = {
  garage: "/app",
  dashboard: "/app/dashboard",
  fuel: "/app/fuel",
  service: "/app/service",
  photos: "/app/photos",
  reminders: "/app/reminders",
  planner: "/app/planner",
  documents: "/app/documents",
  review: "/app/review",
  settings: "/app/settings",
  help: "/app/help",
  account: "/app/account",
};

const PATH_TO_VIEW: Record<string, AppView> = Object.fromEntries(
  Object.entries(VIEW_PATHS).map(([view, path]) => [path, view as AppView]),
);

export type Route = { kind: "landing" } | { kind: "app"; view: AppView };

/** Any path not in `VIEW_PATHS` falls back to the landing page — this app has no dedicated
 * "not found" page (spec.md Edge Cases). */
export function parseRoute(pathname: string): Route {
  const view = PATH_TO_VIEW[pathname];
  return view ? { kind: "app", view } : { kind: "landing" };
}

export function pathForView(view: AppView): string {
  return VIEW_PATHS[view];
}

const NAVIGATE_EVENT = "odograph:navigate";

/** `pushState`/`replaceState` fire no event of their own (only back/forward's `popstate` does) —
 * `useRoute` below listens for this custom event too, so a programmatic navigate() re-renders
 * subscribers just like a browser back/forward action does. */
export function navigate(path: string, options?: { replace?: boolean }): void {
  const current = location.pathname + location.search;
  if (path === current) return;
  if (options?.replace) {
    history.replaceState(null, "", path);
  } else {
    history.pushState(null, "", path);
  }
  dispatchEvent(new Event(NAVIGATE_EVENT));
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.pathname));

  useEffect(() => {
    const update = () => setRoute(parseRoute(location.pathname));
    addEventListener("popstate", update);
    addEventListener(NAVIGATE_EVENT, update);
    return () => {
      removeEventListener("popstate", update);
      removeEventListener(NAVIGATE_EVENT, update);
    };
  }, []);

  return route;
}
