import { test as base } from "@playwright/test";
import { t } from "../../src/client/i18n/strings.ts";

/**
 * Bootstraps an authenticated session via POST /api/v1/_dev/session — the
 * dev/test-only route that stands in for real passkey/magic-link/OIDC login
 * (see src/server/auth/dev-session.ts, FR-009). It 404s outside
 * ENVIRONMENT!=="production", which local `vite dev` always satisfies.
 *
 * Requests go through `context.request` rather than a standalone API
 * request context, because `context.request` shares the browser context's
 * cookie jar — the Set-Cookie the dev route returns is immediately usable
 * by `page.goto()` with no manual cookie plumbing.
 */
export interface DevSession {
  userId: string;
  tenantId: string;
  email: string;
}

export async function bootstrapDevSession(
  context: import("@playwright/test").BrowserContext,
  email?: string,
): Promise<DevSession> {
  const res = await context.request.post("/api/v1/_dev/session", {
    data: email ? { email } : {},
  });
  if (!res.ok()) {
    throw new Error(
      `dev session bootstrap failed: ${res.status()} ${await res.text()} — ` +
        `is ENVIRONMENT=production? the dev route 404s there by design.`,
    );
  }
  const body = await res.json() as { userId: string; tenantId: string };
  return { ...body, email: email ?? "" };
}

/**
 * Extends Playwright's `test` with:
 * - `session`: a fresh tenant + user, isolated from every other test (each
 *   dev-session call creates a brand new tenant, so tests never see each
 *   other's vehicles/records).
 * - `authedPage`: `page` already navigated to `/` with that session's
 *   cookie in place and the post-login shell rendered — the vast majority
 *   of specs want this, not the bare session.
 */
export const test = base.extend<{ session: DevSession; authedPage: import("@playwright/test").Page }>(
  {
    session: async ({ context }, use) => {
      const session = await bootstrapDevSession(context);
      await use(session);
    },
    authedPage: async ({ page, session: _session }, use) => {
      await page.goto("/");
      await page.getByText(t("vehiclesHeading")).waitFor();
      await use(page);
    },
  },
);

export { expect } from "@playwright/test";
