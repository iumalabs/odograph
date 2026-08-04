import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MAX_REQUESTS_PER_WINDOW } from "../../src/server/auth/rate-limit";

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

async function createSession(): Promise<string> {
  const res = await SELF.fetch("https://example.com/api/v1/_dev/session", { method: "POST" });
  return cookieValue(res.headers.get("set-cookie"));
}

function probeWrite(cookie: string): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/_tenant-isolation-probe", {
    method: "POST",
    headers: { Cookie: cookie },
  });
}

describe("rate limiting (User Story 3)", () => {
  it("allows requests under the limit and rejects the one that exceeds it", async () => {
    const cookie = await createSession();
    const createdIds = new Set<string>();

    for (let i = 0; i < MAX_REQUESTS_PER_WINDOW; i++) {
      const res = await probeWrite(cookie);
      expect(res.status).toBe(200);
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
    expect(otherRes.status).toBe(200);
  });
});
