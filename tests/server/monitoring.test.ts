import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import manifest from "../../.release-please-manifest.json";
import { APP_VERSION } from "../../src/client/version";
import { buildServerMonitoringConfig } from "../../src/server/monitoring/config";

describe("buildServerMonitoringConfig (specs/054-error-monitoring)", () => {
  it("is enabled only in the production environment (FR-004)", () => {
    expect(buildServerMonitoringConfig({ ...env, ENVIRONMENT: "production" }).enabled).toBe(true);
    expect(buildServerMonitoringConfig({ ...env, ENVIRONMENT: "preview" }).enabled).toBe(false);
    expect(buildServerMonitoringConfig({ ...env, ENVIRONMENT: "development" }).enabled).toBe(
      false,
    );
  });

  it("tags every event with the same release as the app's own version display (FR-010)", () => {
    const config = buildServerMonitoringConfig({ ...env, ENVIRONMENT: "production" });
    expect(config.release).toBe(manifest["."]);
  });

  // FR-010/US2 regression guard (T011): server and client must never drift to different release
  // values — both must resolve to the exact same string the client's own version display shows.
  it("matches src/client/version.ts's APP_VERSION exactly", () => {
    const config = buildServerMonitoringConfig({ ...env, ENVIRONMENT: "production" });
    expect(config.release).toBe(APP_VERSION);
  });

  it("disables cookie, body, and user-info collection at the source (FR-005)", () => {
    const config = buildServerMonitoringConfig({ ...env, ENVIRONMENT: "production" });
    expect(config.dataCollection?.cookies).toBe(false);
    expect(config.dataCollection?.httpBodies).toEqual([]);
    expect(config.dataCollection?.userInfo).toBe(false);
    expect(config.dataCollection?.httpHeaders?.request).toEqual({
      deny: ["cookie", "authorization"],
    });
  });

  it("beforeSend strips a Cookie header, an Authorization header, and a request body, leaving the rest of the event unmodified (FR-005)", () => {
    const config = buildServerMonitoringConfig({ ...env, ENVIRONMENT: "production" });
    const fabricatedEvent = {
      message: "boom",
      request: {
        url: "https://odograph.dev/api/v1/vehicles",
        method: "GET",
        cookies: { session: "abc123" },
        data: { secret: "should-not-leak" },
        headers: {
          Cookie: "session=abc123",
          Authorization: "Bearer abc123",
          "content-type": "application/json",
        },
      },
    };

    // deno-lint-ignore no-explicit-any
    const scrubbed = (config.beforeSend as any)(fabricatedEvent, {});

    expect(scrubbed.message).toBe("boom");
    expect(scrubbed.request.url).toBe("https://odograph.dev/api/v1/vehicles");
    expect(scrubbed.request.cookies).toBeUndefined();
    expect(scrubbed.request.data).toBeUndefined();
    expect(scrubbed.request.headers.Cookie).toBeUndefined();
    expect(scrubbed.request.headers.Authorization).toBeUndefined();
    expect(scrubbed.request.headers["content-type"]).toBe("application/json");
  });
});
