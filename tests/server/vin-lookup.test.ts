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
});
