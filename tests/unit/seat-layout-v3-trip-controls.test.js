"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTripSeatLayoutControlService,
} = require("../../src/modules/seat-layout-v3-persistence/trip-seat-layout-control.service");

const now = new Date("2026-08-13T08:00:00.000Z");

function base(overrides = {}) {
  const state = {
    trip: { _id: "trip-1", ownerId: "owner-1", busId: "fleet-1", tripDate: new Date("2026-08-25T00:00:00.000Z"), departureTime: "10:00", status: "scheduled" },
    snapshot: {
      tripId: "trip-1", fleetId: "fleet-1", revisionId: "rev-1", capturedAt: now,
      layout: { schemaVersion: 3, vehicleCategory: "BUS", sections: [{
        sectionId: "lower", name: "Lower", role: "LOWER_CABIN", order: 0,
        widthUnits: 5, heightUnits: 2, elements: [{
          elementId: "seat-1", kind: "SEAT", label: "A1",
          position: { x: 0, y: 0 }, size: { width: 1, height: 1 },
          attributes: { comfort: "STANDARD", commercialClass: "STANDARD", accessible: false },
        }],
      }] },
      placeStates: [{ elementId: "seat-1", state: "OPEN" }],
      pricing: { currency: "NPR", status: "PRICED", defaultFare: 1000, overrides: [] },
    },
    control: null,
    conflict: null,
    events: [],
    ...overrides,
  };
  const repository = {
    findTrip: async () => state.trip,
    findSnapshot: async () => state.snapshot,
    findControl: async () => state.control,
    currentPlaceState: (_snapshot, control, id) => control?.stateOverrides?.find((item) => item.elementId === id)?.state || "OPEN",
    currentPricing: (_snapshot, control) => ({ defaultFare: control?.defaultFareOverride ?? 1000, overrides: control?.fareOverrides || [] }),
    findSeatConflict: async () => state.conflict,
    setPlaceState: async ({ elementId, state: next }) => (state.control = { version: (state.control?.version || 0) + 1, stateOverrides: [{ elementId, state: next }] }),
    setPricing: async ({ defaultFare, overrides: fares }) => (state.control = { version: (state.control?.version || 0) + 1, defaultFareOverride: defaultFare, fareOverrides: fares, stateOverrides: state.control?.stateOverrides || [] }),
    recordEvent: async (event) => state.events.push(event),
    resolve: (_snapshot, control) => ({ controlVersion: control?.version || 0, stateOverrides: control?.stateOverrides || [], pricing: { defaultFare: control?.defaultFareOverride ?? 1000, overrides: control?.fareOverrides || [] } }),
  };
  return { state, service: createTripSeatLayoutControlService(repository, () => now) };
}

test("opening a withdrawn place is immediate and audited", async () => {
  const value = base({ control: { version: 2, stateOverrides: [{ elementId: "seat-1", state: "WITHDRAWN" }] } });
  const result = await value.service.changePlaceState("trip-1", "seat-1", { state: "OPEN" }, { id: "owner-1" });
  assert.equal(result.stateOverrides[0].state, "OPEN");
  assert.equal(value.state.events[0].action, "PLACE_OPENED");
});

test("withdrawal is rejected inside the seven-day safety window", async () => {
  const value = base({ trip: { _id: "trip-1", ownerId: "owner-1", busId: "fleet-1", tripDate: new Date("2026-08-18T00:00:00.000Z"), departureTime: "10:00", status: "scheduled" } });
  await assert.rejects(
    value.service.changePlaceState("trip-1", "seat-1", { state: "WITHDRAWN", reason: "Damaged" }, { id: "owner-1" }),
    (error) => error.code === "TRIP_SEAT_WITHDRAWAL_TOO_LATE"
  );
});

test("withdrawal is rejected when the place has a booking or active hold", async () => {
  const value = base({ conflict: { type: "BOOKING", seatLabel: "A1" } });
  await assert.rejects(
    value.service.changePlaceState("trip-1", "seat-1", { state: "WITHDRAWN", reason: "Damaged" }, { id: "owner-1" }),
    (error) => error.code === "TRIP_SEAT_WITHDRAWAL_CONFLICT" && error.details.type === "BOOKING"
  );
});

test("default fare and per-place overrides are validated and audited", async () => {
  const value = base();
  const result = await value.service.changePricing("trip-1", {
    defaultFare: 1000, overrides: [{ elementId: "seat-1", fare: 1250 }],
  }, { id: "owner-1" });
  assert.equal(result.pricing.defaultFare, 1000);
  assert.deepEqual(result.pricing.overrides, [{ elementId: "seat-1", fare: 1250 }]);
  assert.equal(value.state.events[0].action, "PRICING_CHANGED");
});

test("an operator cannot manage another operator's trip", async () => {
  const value = base();
  await assert.rejects(
    value.service.get("trip-1", { id: "owner-2" }),
    (error) => error.code === "TRIP_SEAT_CONTROL_FORBIDDEN" && error.statusCode === 403
  );
});
