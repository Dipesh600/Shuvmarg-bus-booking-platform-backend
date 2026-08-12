"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("../../../src/contracts");
const {
  createFleetUpdatePolicy,
  restrictOwnerUpdate,
  lockApprovedIdentity,
} = require("../../../src/modules/fleet-management/fleet-update.policy");

const layout = (label = "1") => ({
  busShape: "SINGLE_DECKER",
  floors: [{ floorIndex: 0, rows: [{ rowIndex: 0, cells: [{
    colIndex: 0, cellType: "SEAT", seatId: `S${label}`,
    seatLabel: label, seatType: "STANDARD",
  }] }] }],
});

test("owner updates discard fields outside the legacy allow-list", () => {
  const update = { busName: "Safe", approvalStatus: "APPROVED", ownerId: "evil" };
  restrictOwnerUpdate(update);
  assert.deepEqual(update, { busName: "Safe" });
});

test("approved fleet identity edits fail explicitly instead of disappearing", () => {
  const update = {
    busName: "Allowed", busNumber: "blocked", vehicleType: "blocked",
    registrationYear: 2025, seatConfig: {}, totalSeats: 50,
    busType: "blocked", corridorId: "blocked",
  };
  assert.throws(
    () => lockApprovedIdentity({ approvalStatus: "APPROVED" }, update),
    (error) => error instanceof ApiError && error.code === "FLEET_MUTATION_LOCKED"
  );
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
    Bus: {}, getTripModel: () => ({ countDocuments: async (query) => {
      assert.deepEqual(query.status.$in, ["scheduled", "boarding", "in-transit"]);
      return 2;
    } }),
  });
  await assert.rejects(
    policy.verifySeatLayout(
      { _id: "fleet", seatConfig: layout("1") },
      { seatConfig: JSON.stringify(layout("2")) }
    ),
    (err) => err instanceof ApiError && err.code === "FLEET_LAYOUT_CHANGE_BLOCKED"
  );
});

test("trip lookup failure fails closed and malformed layouts are rejected", async () => {
  const logs = [];
  const policy = createFleetUpdatePolicy({
    Bus: {}, getTripModel: () => { throw new Error("model unavailable"); },
    logger: { error: (...args) => logs.push(args) },
  });
  const update = { seatConfig: layout("2") };
  await assert.rejects(
    policy.verifySeatLayout({ _id: "fleet", seatConfig: layout("1") }, update),
    (error) => error instanceof ApiError && error.code === "FLEET_LAYOUT_CHECK_FAILED"
  );
  assert.equal(logs.length, 1);
  await assert.rejects(
    policy.verifySeatLayout({ _id: "fleet", seatConfig: layout("1") }, { seatConfig: "{" }),
    (error) => error instanceof ApiError && error.code === "FLEET_LAYOUT_INVALID"
  );
  const malformed = { amenityIds: "{", documentReviews: "{" };
  policy.parseCatalogAndReviews(malformed);
  assert.deepEqual(malformed, {});
});
