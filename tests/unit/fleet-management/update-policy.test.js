"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("../../../src/contracts");
const {
  createFleetUpdatePolicy,
  restrictOwnerUpdate,
  lockApprovedIdentity,
} = require("../../../src/modules/fleet-management/fleet-update.policy");

test("owner updates discard fields outside the legacy allow-list", () => {
  const update = { busName: "Safe", approvalStatus: "APPROVED", ownerId: "evil" };
  restrictOwnerUpdate(update);
  assert.deepEqual(update, { busName: "Safe" });
});

test("approved fleets retain locked identity and layout fields", () => {
  const update = {
    busName: "Allowed", busNumber: "blocked", vehicleType: "blocked",
    registrationYear: 2025, seatConfig: {}, totalSeats: 50,
    busType: "blocked", corridorId: "blocked",
  };
  lockApprovedIdentity({ approvalStatus: "APPROVED" }, update);
  assert.deepEqual(update, { busName: "Allowed" });
});

test("bus-number normalization rejects duplicates exactly", async () => {
  let query;
  const policy = createFleetUpdatePolicy({
    Bus: { findOne: async (value) => { query = value; return {}; } },
    getTripModel: () => ({}),
  });
  const update = { busNumber: " ba 2 kha 4 " };
  await assert.rejects(
    policy.normalizeBusNumber({ busNumber: "OLD" }, update),
    (err) => err instanceof ApiError && err.code === "FLEET_ALREADY_EXISTS"
  );
  assert.deepEqual(query, { busNumber: "BA 2 KHA 4" });
});

test("changed seat layouts are blocked while active trips exist", async () => {
  const policy = createFleetUpdatePolicy({
    Bus: {}, getTripModel: () => ({ countDocuments: async () => 2 }),
  });
  await assert.rejects(
    policy.verifySeatLayout(
      { _id: "fleet", seatConfig: { rows: 4 } },
      { seatConfig: '{"rows":5}' }
    ),
    (err) => err instanceof ApiError && err.code === "FLEET_VALIDATION_FAILED"
  );
});

test("trip lookup failure remains non-fatal and malformed JSON is discarded", async () => {
  const logs = [];
  const policy = createFleetUpdatePolicy({
    Bus: {}, getTripModel: () => { throw new Error("model unavailable"); },
    logger: { error: (...args) => logs.push(args) },
  });
  const update = { seatConfig: '{"rows":5}' };
  await policy.verifySeatLayout({ _id: "fleet", seatConfig: {} }, update);
  assert.deepEqual(update.seatConfig, { rows: 5 });
  assert.equal(logs.length, 1);
  const malformed = { amenityIds: "{", documentReviews: "{" };
  policy.parseCatalogAndReviews(malformed);
  assert.deepEqual(malformed, {});
});
