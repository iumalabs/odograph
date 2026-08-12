import { SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_REQUESTS_PER_WINDOW, WINDOW_SECONDS } from "../../src/server/auth/rate-limit";

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

/**
 * The limiter uses a real-clock fixed window. A burst that starts near a
 * window boundary can straddle two windows, under-counting and flaking this
 * test (`expected 200 to be 429`). Wait out any boundary close enough that a
 * slow CI runner could cross it mid-burst, so the whole test gets a fresh
 * window with maximal headroom.
 */
async function waitForFreshWindow(marginMs = 10_000): Promise<void> {
  const windowMs = WINDOW_SECONDS * 1000;
  const msRemaining = windowMs - (Date.now() % windowMs);
  if (msRemaining < marginMs) {
    await new Promise((resolve) => setTimeout(resolve, msRemaining + 50));
  }
}

async function createSession(): Promise<string> {
  const res = await SELF.fetch("https://example.com/api/v1/_dev/session", { method: "POST" });
  return cookieValue(res.headers.get("set-cookie"));
}

function probeWrite(cookie: string): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/vehicles", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "probe", odometerUnit: "km" }),
  });
}

describe("rate limiting (User Story 3)", () => {
  beforeEach(async () => {
    await waitForFreshWindow();
  });

  it("allows requests under the limit and rejects the one that exceeds it", async () => {
    const cookie = await createSession();
    const createdIds = new Set<string>();

    for (let i = 0; i < MAX_REQUESTS_PER_WINDOW; i++) {
      const res = await probeWrite(cookie);
      expect(res.status).toBe(201);
      const { id } = (await res.json()) as { id: string };
      createdIds.add(id);
    }

    // Every request up to the limit performed a real, distinct write.
    expect(createdIds.size).toBe(MAX_REQUESTS_PER_WINDOW);

    const overLimitRes = await probeWrite(cookie);
    expect(overLimitRes.status).toBe(429);
    expect(overLimitRes.headers.get("Retry-After")).not.toBeNull();
    const overLimitBody = (await overLimitRes.json()) as { error: string };
    expect(overLimitBody.error).toBe("rate_limited");
  });

  it("does not affect a different session's write budget", async () => {
    const throttledCookie = await createSession();
    for (let i = 0; i < MAX_REQUESTS_PER_WINDOW; i++) {
      await probeWrite(throttledCookie);
    }
    const throttledRes = await probeWrite(throttledCookie);
    expect(throttledRes.status).toBe(429);

    const otherCookie = await createSession();
    const otherRes = await probeWrite(otherCookie);
    expect(otherRes.status).toBe(201);
  });

  it("POST /_dev/session itself is not rate-limited (issue #89/#97 CI investigation)", async () => {
    for (let i = 0; i < MAX_REQUESTS_PER_WINDOW + 5; i++) {
      const res = await SELF.fetch("https://example.com/api/v1/_dev/session", { method: "POST" });
      expect(res.status).toBe(200);
    }
  });
});
