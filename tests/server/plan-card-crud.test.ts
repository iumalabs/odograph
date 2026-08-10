import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

async function createSession(): Promise<{ cookie: string; tenantId: string }> {
  const res = await SELF.fetch("https://example.com/api/v1/_dev/session", { method: "POST" });
  const body = (await res.json()) as { tenantId: string };
  return { cookie: cookieValue(res.headers.get("set-cookie")), tenantId: body.tenantId };
}

type VehicleBody = { name?: unknown; odometerUnit?: unknown };

async function createVehicleId(cookie: string, body: VehicleBody = {}): Promise<string> {
  const res = await SELF.fetch("https://example.com/api/v1/vehicles", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test Vehicle", odometerUnit: "km", ...body }),
  });
  const created = (await res.json()) as { id: string };
  return created.id;
}

function deleteVehicleReq(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
}

type PlanCardBody = {
  title?: unknown;
  stage?: unknown;
  targetDate?: unknown;
  estimatedCost?: unknown;
  urgent?: unknown;
};

function createPlanCard(cookie: string, vehicleId: string, body: PlanCardBody): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/plan-cards`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createPlanCardId(
  cookie: string,
  vehicleId: string,
  body: PlanCardBody = {},
): Promise<string> {
  const res = await createPlanCard(cookie, vehicleId, { title: "Test card", ...body });
  const created = (await res.json()) as { id: string };
  return created.id;
}

function listPlanCards(cookie: string, vehicleId: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/plan-cards`, {
    headers: { Cookie: cookie },
  });
}

function getPlanCard(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/plan-cards/${id}`, {
    headers: { Cookie: cookie },
  });
}

function patchPlanCard(cookie: string, id: string, body: PlanCardBody): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/plan-cards/${id}`, {
    method: "PATCH",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deletePlanCardReq(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/plan-cards/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
}

function createFuelRecord(
  cookie: string,
  vehicleId: string,
  odometerReading: number,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/fuel-records`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      fuelDate: "2026-01-01",
      odometerReading,
      volume: 40,
      cost: 60,
    }),
  });
}

function listServiceRecords(cookie: string, vehicleId: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/service-records`, {
    headers: { Cookie: cookie },
  });
}

async function serviceRecordCount(vehicleId: string): Promise<number> {
  const row = await env.DB
    .prepare("SELECT COUNT(*) AS c FROM service_records WHERE vehicle_id = ?")
    .bind(vehicleId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

async function planCardCount(vehicleId: string): Promise<number> {
  const row = await env.DB
    .prepare("SELECT COUNT(*) AS c FROM plan_cards WHERE vehicle_id = ?")
    .bind(vehicleId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

describe("plan card creation (User Story 1)", () => {
  it("creates a card with only a title and it appears in the vehicle's list, stage idea", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await createPlanCard(cookie, vehicleId, { title: "New brake pads" });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; title: string; stage: string };
    expect(created.title).toBe("New brake pads");
    expect(created.stage).toBe("idea");

    const listRes = await listPlanCards(cookie, vehicleId);
    const { planCards } = (await listRes.json()) as { planCards: { id: string }[] };
    expect(planCards.some((c) => c.id === created.id)).toBe(true);
  });

  it("stores every optional field exactly as submitted", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await createPlanCard(cookie, vehicleId, {
      title: "New tires",
      targetDate: "2026-12-01",
      estimatedCost: 400.5,
      urgent: true,
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created).toMatchObject({
      title: "New tires",
      targetDate: "2026-12-01",
      estimatedCost: 400.5,
      urgent: true,
      stage: "idea",
    });
  });

  it("rejects a missing title and creates nothing", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await createPlanCard(cookie, vehicleId, {});
    expect(res.status).toBe(400);

    const listRes = await listPlanCards(cookie, vehicleId);
    const { planCards } = (await listRes.json()) as { planCards: unknown[] };
    expect(planCards.length).toBe(0);
  });

  it("refuses to create against a vehicle belonging to a different tenant or a made-up id, identically (FR-003)", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const madeUpId = crypto.randomUUID();

    const crossCreate = await createPlanCard(other.cookie, vehicleId, { title: "Should fail" });
    const madeUpCreate = await createPlanCard(other.cookie, madeUpId, { title: "Should fail" });
    expect(crossCreate.status).toBe(404);
    expect(madeUpCreate.status).toBe(404);
    expect(await crossCreate.text()).toBe(await madeUpCreate.text());
  });
});

describe("plan card stage moves (User Story 2)", () => {
  it("moves a card through each of the four valid stages", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createPlanCardId(cookie, vehicleId);

    for (const stage of ["buy", "doing", "idea", "buy"]) {
      const res = await patchPlanCard(cookie, id, { stage });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { stage: string };
      expect(body.stage).toBe(stage);
    }
  });

  it("rejects an invalid stage value and leaves the card unchanged", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createPlanCardId(cookie, vehicleId, { title: "Original" });

    const res = await patchPlanCard(cookie, id, { stage: "not-a-real-stage" });
    expect(res.status).toBe(400);

    const after = (await (await getPlanCard(cookie, id)).json()) as { stage: string };
    expect(after.stage).toBe("idea");
  });

  it("refuses to fetch or update a different tenant's card, identically to a made-up id", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const id = await createPlanCardId(owner.cookie, vehicleId, { title: "Protected" });
    const madeUpId = crypto.randomUUID();

    const crossFetch = await getPlanCard(other.cookie, id);
    const madeUpFetch = await getPlanCard(other.cookie, madeUpId);
    expect(crossFetch.status).toBe(404);
    expect(madeUpFetch.status).toBe(404);
    expect(await crossFetch.text()).toBe(await madeUpFetch.text());

    const crossPatch = await patchPlanCard(other.cookie, id, { stage: "buy" });
    expect(crossPatch.status).toBe(404);
  });
});

describe("completing a card logs a real maintenance record (User Story 3)", () => {
  it("moving a card to done creates exactly one service record with its title, date, and cost (SC-003)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createPlanCardId(cookie, vehicleId, {
      title: "Oil change",
      estimatedCost: 75,
    });

    const before = await serviceRecordCount(vehicleId);
    const res = await patchPlanCard(cookie, id, { stage: "done" });
    expect(res.status).toBe(200);
    const after = await serviceRecordCount(vehicleId);
    expect(after).toBe(before + 1);

    const list = (await (await listServiceRecords(cookie, vehicleId)).json()) as {
      serviceRecords: { description: string; cost: number | null; notes: string | null }[];
    };
    const created = list.serviceRecords.find((r) => r.description === "Oil change");
    expect(created).toBeDefined();
    expect(created?.cost).toBe(75);
    expect(created?.notes).toBe("Created from the maintenance planner");
  });

  it("includes the vehicle's known odometer reading when available, and null when it isn't (FR-007)", async () => {
    const { cookie } = await createSession();

    const vehicleWithOdo = await createVehicleId(cookie);
    await createFuelRecord(cookie, vehicleWithOdo, 12000);
    const idWithOdo = await createPlanCardId(cookie, vehicleWithOdo, { title: "Has odometer" });
    await patchPlanCard(cookie, idWithOdo, { stage: "done" });
    const listWithOdo = (await (await listServiceRecords(cookie, vehicleWithOdo)).json()) as {
      serviceRecords: { description: string; odometerReading: number | null }[];
    };
    expect(
      listWithOdo.serviceRecords.find((r) => r.description === "Has odometer")?.odometerReading,
    )
      .toBe(12000);

    const vehicleNoOdo = await createVehicleId(cookie);
    const idNoOdo = await createPlanCardId(cookie, vehicleNoOdo, { title: "No odometer" });
    await patchPlanCard(cookie, idNoOdo, { stage: "done" });
    const listNoOdo = (await (await listServiceRecords(cookie, vehicleNoOdo)).json()) as {
      serviceRecords: { description: string; odometerReading: number | null }[];
    };
    expect(listNoOdo.serviceRecords.find((r) => r.description === "No odometer")?.odometerReading)
      .toBeNull();
  });

  it("does not create an additional service record when an already-done card is set to done again (SC-004, FR-008)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createPlanCardId(cookie, vehicleId, { title: "Repeat done" });

    await patchPlanCard(cookie, id, { stage: "done" });
    const afterFirst = await serviceRecordCount(vehicleId);

    const second = await patchPlanCard(cookie, id, { stage: "done" });
    expect(second.status).toBe(200);
    const afterSecond = await serviceRecordCount(vehicleId);
    expect(afterSecond).toBe(afterFirst);
  });

  it("keeps the completed card visible on the board in the done column", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createPlanCardId(cookie, vehicleId, { title: "Stays visible" });

    await patchPlanCard(cookie, id, { stage: "done" });

    const list = (await (await listPlanCards(cookie, vehicleId)).json()) as {
      planCards: { id: string; stage: string }[];
    };
    const card = list.planCards.find((c) => c.id === id);
    expect(card).toBeDefined();
    expect(card?.stage).toBe("done");
  });
});

describe("deleting a plan card (User Story 4)", () => {
  it("removes the card from the vehicle's list immediately", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createPlanCardId(cookie, vehicleId);

    const del = await deletePlanCardReq(cookie, id);
    expect(del.status).toBe(204);

    const fetchAfter = await getPlanCard(cookie, id);
    expect(fetchAfter.status).toBe(404);

    const listAfter = (await (await listPlanCards(cookie, vehicleId)).json()) as {
      planCards: { id: string }[];
    };
    expect(listAfter.planCards.some((c) => c.id === id)).toBe(false);
  });

  it("refuses to delete a different tenant's card and leaves it intact", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const id = await createPlanCardId(owner.cookie, vehicleId, { title: "Protected" });

    const crossDelete = await deletePlanCardReq(other.cookie, id);
    expect(crossDelete.status).toBe(404);

    const ownFetch = await getPlanCard(owner.cookie, id);
    expect(ownFetch.status).toBe(200);
  });

  it("never creates, modifies, or removes a service record as a side effect, even for a done card (FR-009)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createPlanCardId(cookie, vehicleId, { title: "Delete after done" });
    await patchPlanCard(cookie, id, { stage: "done" });

    const before = await serviceRecordCount(vehicleId);
    const del = await deletePlanCardReq(cookie, id);
    expect(del.status).toBe(204);
    const after = await serviceRecordCount(vehicleId);
    expect(after).toBe(before);
  });
});

describe("vehicle deletion cascades plan cards (retrofit)", () => {
  it("deleting a vehicle removes its plan cards", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    await createPlanCardId(cookie, vehicleId);
    expect(await planCardCount(vehicleId)).toBe(1);

    const del = await deleteVehicleReq(cookie, vehicleId);
    expect(del.status).toBe(204);

    expect(await planCardCount(vehicleId)).toBe(0);
  });
});
