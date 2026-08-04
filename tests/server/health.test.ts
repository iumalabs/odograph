import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /api/v1/health", () => {
  it("returns ok status", async () => {
    const response = await SELF.fetch("https://example.com/api/v1/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});
