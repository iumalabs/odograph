import { SELF } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { decodeVin } from "../../src/server/vin-lookup/decode-vin";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const VALID_VIN = "1FTFW1ET5BFC10312";

describe("decodeVin", () => {
  it("returns a full decode when NHTSA returns all three fields", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        Results: [{ ErrorCode: "0", Make: "FORD", Model: "F-150", ModelYear: "2011" }],
      }),
    );
    const result = await decodeVin(VALID_VIN, fetchImpl);
    expect(result).toEqual({ ok: true, make: "FORD", model: "F-150", year: 2011 });
  });

  it("leaves a field null when NHTSA didn't return it, never guessing (FR-003/FR-005)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        Results: [{ ErrorCode: "0", Make: "FORD", Model: "", ModelYear: "" }],
      }),
    );
    const result = await decodeVin(VALID_VIN, fetchImpl);
    expect(result).toEqual({ ok: true, make: "FORD", model: null, year: null });
  });

  it("returns ok:false when NHTSA returns no usable fields at all", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        Results: [{ ErrorCode: "1,7,11,400", Make: "", Model: "", ModelYear: "" }],
      }),
    );
    const result = await decodeVin(VALID_VIN, fetchImpl);
    expect(result).toEqual({ ok: false });
  });

  it("still returns decoded fields even when ErrorCode is non-zero (e.g. a check-digit mismatch) — real NHTSA behavior confirmed via live testing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        Results: [{ ErrorCode: "1", Make: "FORD", Model: "F-150", ModelYear: "2011" }],
      }),
    );
    const result = await decodeVin(VALID_VIN, fetchImpl);
    expect(result).toEqual({ ok: true, make: "FORD", model: "F-150", year: 2011 });
  });

  it("returns ok:false on a non-2xx response from NHTSA", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, 503));
    const result = await decodeVin(VALID_VIN, fetchImpl);
    expect(result).toEqual({ ok: false });
  });

  it("returns ok:false when the fetch itself rejects", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await decodeVin(VALID_VIN, fetchImpl);
    expect(result).toEqual({ ok: false });
  });

  it("short-circuits an obviously too-short VIN without calling fetch", async () => {
    const fetchImpl = vi.fn();
    const result = await decodeVin("SHORT", fetchImpl);
    expect(result).toEqual({ ok: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("short-circuits an implausibly long VIN without calling fetch (code-review finding)", async () => {
    const fetchImpl = vi.fn();
    const result = await decodeVin("X".repeat(40), fetchImpl);
    expect(result).toEqual({ ok: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("trims the VIN before both the length check and the outbound request (code-review finding)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        Results: [{ ErrorCode: "0", Make: "FORD", Model: "F-150", ModelYear: "2011" }],
      }),
    );
    const result = await decodeVin(`  ${VALID_VIN}  `, fetchImpl);
    expect(result).toEqual({ ok: true, make: "FORD", model: "F-150", year: 2011 });
    const requestedUrl = fetchImpl.mock.calls[0]?.[0] as string;
    expect(requestedUrl).toContain(encodeURIComponent(VALID_VIN));
    expect(requestedUrl).not.toContain("%20");
  });

  it("rejects an implausible model year (e.g. NHTSA returning garbage) rather than passing it through", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        Results: [{ ErrorCode: "0", Make: "FORD", Model: "F-150", ModelYear: "1066" }],
      }),
    );
    const result = await decodeVin(VALID_VIN, fetchImpl);
    expect(result).toEqual({ ok: true, make: "FORD", model: "F-150", year: null });
  });
});

// Route-level coverage is deliberately limited to paths that never reach the real NHTSA network
// call — going through the actual success path via SELF.fetch would make a live third-party
// request from the automated suite, which this project's established pattern for external-HTTP
// routes avoids (see tests/server/oidc-auth.test.ts's identical note for Google's token exchange).
// decodeVin's own logic is already fully covered above via an injected fetchImpl.
describe("GET /api/v1/vin-lookup/:vin route wiring", () => {
  it("refuses an unauthenticated request with 401 before any lookup is attempted", async () => {
    const res = await SELF.fetch(`https://example.com/api/v1/vin-lookup/${VALID_VIN}`);
    expect(res.status).toBe(401);
  });

  it("returns found:false for a too-short VIN without an authenticated session touching NHTSA", async () => {
    const sessionRes = await SELF.fetch("https://example.com/api/v1/_dev/session", {
      method: "POST",
    });
    const cookie = (sessionRes.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    const res = await SELF.fetch("https://example.com/api/v1/vin-lookup/SHORT", {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ found: false, make: null, model: null, year: null });
  });
});
