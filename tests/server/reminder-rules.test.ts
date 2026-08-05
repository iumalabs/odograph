import { createScheduledController, env, SELF, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../../src/server/index";

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

function createFuelRecordReq(
  cookie: string,
  vehicleId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/fuel-records`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

type ReminderRuleBody = {
  label?: unknown;
  intervalDays?: unknown;
  intervalDistance?: unknown;
  lastDoneDate?: unknown;
  lastDoneOdometer?: unknown;
};

function createReminderRule(
  cookie: string,
  vehicleId: string,
  body: ReminderRuleBody,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/reminder-rules`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function listReminderRules(cookie: string, vehicleId: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/reminder-rules`, {
    headers: { Cookie: cookie },
  });
}

function getReminderRule(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/reminder-rules/${id}`, {
    headers: { Cookie: cookie },
  });
}

function patchReminderRule(cookie: string, id: string, body: ReminderRuleBody): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/reminder-rules/${id}`, {
    method: "PATCH",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReminderRuleReq(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/reminder-rules/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
}

function markDone(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/reminder-rules/${id}/mark-done`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
}

function isoDateDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("reminder rule creation (User Story 1)", () => {
  let sharedCookie: string;

  beforeAll(async () => {
    sharedCookie = (await createSession()).cookie;
  });

  it("creates a rule with only a date interval and it appears in the vehicle's list", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    const res = await createReminderRule(sharedCookie, vehicleId, {
      label: "Registration renewal",
      intervalDays: 365,
      lastDoneDate: isoDateDaysFromNow(0),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string };

    const listRes = await listReminderRules(sharedCookie, vehicleId);
    const { reminderRules } = (await listRes.json()) as { reminderRules: { id: string }[] };
    expect(reminderRules.some((r) => r.id === created.id)).toBe(true);
  });

  it("creates a rule with only a mileage interval, and one with both", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    const mileageOnly = await createReminderRule(sharedCookie, vehicleId, {
      label: "Tire rotation",
      intervalDistance: 10000,
      lastDoneOdometer: 5000,
    });
    expect(mileageOnly.status).toBe(201);

    const both = await createReminderRule(sharedCookie, vehicleId, {
      label: "Oil change",
      intervalDays: 180,
      intervalDistance: 8000,
      lastDoneDate: isoDateDaysFromNow(0),
      lastDoneOdometer: 5000,
    });
    expect(both.status).toBe(201);
  });

  it("rejects a rule with neither interval, creating nothing", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    const res = await createReminderRule(sharedCookie, vehicleId, { label: "Nothing to track" });
    expect(res.status).toBe(400);

    const listRes = await listReminderRules(sharedCookie, vehicleId);
    const { reminderRules } = (await listRes.json()) as { reminderRules: unknown[] };
    expect(reminderRules.length).toBe(0);
  });

  it("rejects a rule missing the anchor field for the interval it declares", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    const noLastDoneDate = await createReminderRule(sharedCookie, vehicleId, {
      label: "Missing anchor",
      intervalDays: 90,
    });
    expect(noLastDoneDate.status).toBe(400);

    const noLastDoneOdometer = await createReminderRule(sharedCookie, vehicleId, {
      label: "Missing anchor",
      intervalDistance: 5000,
    });
    expect(noLastDoneOdometer.status).toBe(400);
  });

  it("refuses to create against a vehicle belonging to a different tenant or a made-up id, identically (FR-003)", async () => {
    const other = await createSession();
    const vehicleId = await createVehicleId(sharedCookie);
    const madeUpId = crypto.randomUUID();

    const crossCreate = await createReminderRule(other.cookie, vehicleId, {
      label: "Should fail",
      intervalDays: 90,
      lastDoneDate: isoDateDaysFromNow(0),
    });
    const madeUpCreate = await createReminderRule(other.cookie, madeUpId, {
      label: "Should fail",
      intervalDays: 90,
      lastDoneDate: isoDateDaysFromNow(0),
    });
    expect(crossCreate.status).toBe(404);
    expect(madeUpCreate.status).toBe(404);
    expect(await crossCreate.text()).toBe(await madeUpCreate.text());
  });
});

describe("reminder rule status computation (User Story 2)", () => {
  let sharedCookie: string;

  beforeAll(async () => {
    sharedCookie = (await createSession()).cookie;
  });

  it("computes on_track, coming_up, and overdue for a date-based rule", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    const onTrack = (await (await createReminderRule(sharedCookie, vehicleId, {
      label: "On track",
      intervalDays: 100,
      lastDoneDate: isoDateDaysFromNow(0),
    })).json()) as { status: string };
    expect(onTrack.status).toBe("on_track");

    const comingUp = (await (await createReminderRule(sharedCookie, vehicleId, {
      label: "Coming up",
      intervalDays: 100,
      lastDoneDate: isoDateDaysFromNow(-95),
    })).json()) as { status: string };
    expect(comingUp.status).toBe("coming_up");

    const overdue = (await (await createReminderRule(sharedCookie, vehicleId, {
      label: "Overdue",
      intervalDays: 100,
      lastDoneDate: isoDateDaysFromNow(-110),
    })).json()) as { status: string };
    expect(overdue.status).toBe("overdue");
  });

  it("computes on_track, coming_up, and overdue for a mileage-based rule using the vehicle's logged odometer history", async () => {
    const vehicleId = await createVehicleId(sharedCookie);
    // currentOdometer = 3000; intervalDistance = 1000 throughout, so due = lastDoneOdometer + 1000.
    await createFuelRecordReq(sharedCookie, vehicleId, {
      fuelDate: isoDateDaysFromNow(0),
      odometerReading: 3000,
      volume: 40,
      cost: 60,
    });

    const onTrack = (await (await createReminderRule(sharedCookie, vehicleId, {
      label: "On track",
      intervalDistance: 1000,
      lastDoneOdometer: 2500, // due 3500, remaining 500/1000 = 0.5
    })).json()) as { status: string };
    expect(onTrack.status).toBe("on_track");

    const comingUp = (await (await createReminderRule(sharedCookie, vehicleId, {
      label: "Coming up",
      intervalDistance: 1000,
      lastDoneOdometer: 2050, // due 3050, remaining 50/1000 = 0.05
    })).json()) as { status: string };
    expect(comingUp.status).toBe("coming_up");

    const overdue = (await (await createReminderRule(sharedCookie, vehicleId, {
      label: "Overdue",
      intervalDistance: 1000,
      lastDoneOdometer: 1800, // due 2800, already passed by the current 3000
    })).json()) as { status: string };
    expect(overdue.status).toBe("overdue");
  });

  it("shows not_enough_data for a mileage-only rule on a vehicle with no fuel/service records", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    const res = await createReminderRule(sharedCookie, vehicleId, {
      label: "No data yet",
      intervalDistance: 5000,
      lastDoneOdometer: 0,
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { status: string; byMileage: string };
    expect(created.status).toBe("not_enough_data");
    expect(created.byMileage).toBe("not_enough_data");
  });

  it("reports the more urgent side when both intervals disagree", async () => {
    const vehicleId = await createVehicleId(sharedCookie);
    await createFuelRecordReq(sharedCookie, vehicleId, {
      fuelDate: isoDateDaysFromNow(0),
      odometerReading: 3000,
      volume: 40,
      cost: 60,
    });

    const res = await createReminderRule(sharedCookie, vehicleId, {
      label: "Disagreement",
      intervalDays: 100,
      lastDoneDate: isoDateDaysFromNow(0), // on_track by date
      intervalDistance: 1000,
      lastDoneOdometer: 1800, // due 2800, overdue against current 3000
    });
    const created = (await res.json()) as { status: string; byDate: string; byMileage: string };
    expect(created.byDate).toBe("on_track");
    expect(created.byMileage).toBe("overdue");
    expect(created.status).toBe("overdue");
  });

  it("lists only each tenant's own vehicle's reminder rules", async () => {
    const tenantA = await createSession();
    const tenantB = await createSession();
    const vehicleA = await createVehicleId(tenantA.cookie);
    const vehicleB = await createVehicleId(tenantB.cookie);

    await createReminderRule(tenantA.cookie, vehicleA, {
      label: "A's rule",
      intervalDays: 30,
      lastDoneDate: isoDateDaysFromNow(0),
    });
    await createReminderRule(tenantB.cookie, vehicleB, {
      label: "B's rule",
      intervalDays: 30,
      lastDoneDate: isoDateDaysFromNow(0),
    });

    const listA = (await (await listReminderRules(tenantA.cookie, vehicleA)).json()) as {
      reminderRules: { label: string }[];
    };
    expect(listA.reminderRules.map((r) => r.label)).toEqual(["A's rule"]);
  });

  it("refuses to list or fetch a different tenant's vehicle/rule, identically to a made-up id (FR-003)", async () => {
    const other = await createSession();
    const vehicleId = await createVehicleId(sharedCookie);
    const id = (await (await createReminderRule(sharedCookie, vehicleId, {
      label: "Owned",
      intervalDays: 30,
      lastDoneDate: isoDateDaysFromNow(0),
    })).json()) as { id: string };

    const crossFetch = await getReminderRule(other.cookie, id.id);
    const madeUpFetch = await getReminderRule(other.cookie, crypto.randomUUID());
    expect(crossFetch.status).toBe(404);
    expect(madeUpFetch.status).toBe(404);
    expect(await crossFetch.text()).toBe(await madeUpFetch.text());

    const crossList = await listReminderRules(other.cookie, vehicleId);
    expect(crossList.status).toBe(404);
  });
});

describe("mark reminder rule done (User Story 3)", () => {
  let sharedCookie: string;

  beforeAll(async () => {
    sharedCookie = (await createSession()).cookie;
  });

  it("resets an overdue date-based rule to on_track and leaves its odometer anchor untouched", async () => {
    const vehicleId = await createVehicleId(sharedCookie);
    const created = (await (await createReminderRule(sharedCookie, vehicleId, {
      label: "Overdue by date",
      intervalDays: 100,
      lastDoneDate: isoDateDaysFromNow(-110),
    })).json()) as { id: string; lastDoneOdometer: number | null };
    expect(created.lastDoneOdometer).toBeNull();

    const res = await markDone(sharedCookie, created.id);
    expect(res.status).toBe(200);
    const updated = (await res.json()) as {
      status: string;
      lastDoneDate: string;
      lastDoneOdometer: number | null;
    };
    expect(updated.status).toBe("on_track");
    expect(updated.lastDoneDate).toBe(isoDateDaysFromNow(0));
    expect(updated.lastDoneOdometer).toBeNull();
  });

  it("resets an overdue mileage-based rule's odometer anchor to the vehicle's current odometer, leaving its date anchor untouched", async () => {
    const vehicleId = await createVehicleId(sharedCookie);
    await createFuelRecordReq(sharedCookie, vehicleId, {
      fuelDate: isoDateDaysFromNow(0),
      odometerReading: 5000,
      volume: 40,
      cost: 60,
    });

    const created = (await (await createReminderRule(sharedCookie, vehicleId, {
      label: "Overdue by mileage",
      intervalDistance: 1000,
      lastDoneOdometer: 3800, // due 4800, overdue against current 5000
    })).json()) as { id: string; status: string; lastDoneDate: string | null };
    expect(created.status).toBe("overdue");
    expect(created.lastDoneDate).toBeNull();

    const res = await markDone(sharedCookie, created.id);
    expect(res.status).toBe(200);
    const updated = (await res.json()) as {
      status: string;
      lastDoneOdometer: number;
      lastDoneDate: string | null;
    };
    expect(updated.status).toBe("on_track");
    expect(updated.lastDoneOdometer).toBe(5000);
    expect(updated.lastDoneDate).toBeNull();
  });

  it("refuses to mark a different tenant's rule done, identically to a made-up id, and leaves it untouched", async () => {
    const other = await createSession();
    const vehicleId = await createVehicleId(sharedCookie);
    const created = (await (await createReminderRule(sharedCookie, vehicleId, {
      label: "Owned",
      intervalDays: 30,
      lastDoneDate: isoDateDaysFromNow(-20),
    })).json()) as { id: string };

    const crossMark = await markDone(other.cookie, created.id);
    const madeUpMark = await markDone(other.cookie, crypto.randomUUID());
    expect(crossMark.status).toBe(404);
    expect(madeUpMark.status).toBe(404);
    expect(await crossMark.text()).toBe(await madeUpMark.text());

    const stillOwned = (await (await getReminderRule(sharedCookie, created.id)).json()) as {
      lastDoneDate: string;
    };
    expect(stillOwned.lastDoneDate).toBe(isoDateDaysFromNow(-20));
  });
});

describe("update and delete reminder rules (User Story 4)", () => {
  let sharedCookie: string;

  beforeAll(async () => {
    sharedCookie = (await createSession()).cookie;
  });

  it("updates one field, leaves every other field unchanged, and recomputes status", async () => {
    const vehicleId = await createVehicleId(sharedCookie);
    const created = (await (await createReminderRule(sharedCookie, vehicleId, {
      label: "Original label",
      intervalDays: 100,
      lastDoneDate: isoDateDaysFromNow(0),
    })).json()) as { id: string };

    const res = await patchReminderRule(sharedCookie, created.id, {
      lastDoneDate: isoDateDaysFromNow(-110),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()) as {
      label: string;
      intervalDays: number;
      lastDoneDate: string;
      status: string;
    };
    expect(updated.label).toBe("Original label");
    expect(updated.intervalDays).toBe(100);
    expect(updated.lastDoneDate).toBe(isoDateDaysFromNow(-110));
    expect(updated.status).toBe("overdue");
  });

  it("rejects clearing the only interval a rule has, applying no change", async () => {
    const vehicleId = await createVehicleId(sharedCookie);
    const created = (await (await createReminderRule(sharedCookie, vehicleId, {
      label: "Date only",
      intervalDays: 100,
      lastDoneDate: isoDateDaysFromNow(0),
    })).json()) as { id: string };

    const res = await patchReminderRule(sharedCookie, created.id, { intervalDays: null });
    expect(res.status).toBe(400);

    const stillIntact = (await (await getReminderRule(sharedCookie, created.id)).json()) as {
      intervalDays: number;
    };
    expect(stillIntact.intervalDays).toBe(100);
  });

  it("makes a deleted rule immediately unreachable from list and fetch", async () => {
    const vehicleId = await createVehicleId(sharedCookie);
    const created = (await (await createReminderRule(sharedCookie, vehicleId, {
      label: "To delete",
      intervalDays: 30,
      lastDoneDate: isoDateDaysFromNow(0),
    })).json()) as { id: string };

    const del = await deleteReminderRuleReq(sharedCookie, created.id);
    expect(del.status).toBe(204);

    const fetchAfter = await getReminderRule(sharedCookie, created.id);
    expect(fetchAfter.status).toBe(404);

    const { reminderRules } = (await (await listReminderRules(sharedCookie, vehicleId)).json()) as {
      reminderRules: { id: string }[];
    };
    expect(reminderRules.some((r) => r.id === created.id)).toBe(false);
  });

  it("refuses to update or delete a different tenant's rule, identically to a made-up id, and leaves it intact", async () => {
    const other = await createSession();
    const vehicleId = await createVehicleId(sharedCookie);
    const created = (await (await createReminderRule(sharedCookie, vehicleId, {
      label: "Owned",
      intervalDays: 30,
      lastDoneDate: isoDateDaysFromNow(0),
    })).json()) as { id: string };

    const crossPatch = await patchReminderRule(other.cookie, created.id, { label: "Hijacked" });
    const madeUpPatch = await patchReminderRule(other.cookie, crypto.randomUUID(), {
      label: "Hijacked",
    });
    expect(crossPatch.status).toBe(404);
    expect(madeUpPatch.status).toBe(404);
    expect(await crossPatch.text()).toBe(await madeUpPatch.text());

    const crossDelete = await deleteReminderRuleReq(other.cookie, created.id);
    const madeUpDelete = await deleteReminderRuleReq(other.cookie, crypto.randomUUID());
    expect(crossDelete.status).toBe(404);
    expect(madeUpDelete.status).toBe(404);
    expect(await crossDelete.text()).toBe(await madeUpDelete.text());

    const stillOwned = (await (await getReminderRule(sharedCookie, created.id)).json()) as {
      label: string;
    };
    expect(stillOwned.label).toBe("Owned");
  });
});
