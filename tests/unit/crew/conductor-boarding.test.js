"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createConductorController } = require("../../../src/modules/conductor/boarding.controller");
const { createConductorTripController } = require("../../../src/modules/bus-owner/crew/conductor-trip.controller");
const tripId = "650000000000000000000001";
const userId = "650000000000000000000002";
const profileId = "650000000000000000000003";
const query = value => ({ lean: async () => value, populate() { return this; } });
const response = () => ({ code: 0, body: null, status(code) { this.code = code; return this; },
  json(body) { this.body = body; return this; } });
const req = () => ({ userInfo: { id: userId, activeRole: "conductor" },
  params: { tripId }, body: { tripId, ticketId: "TICKET-1" } });

function fixture(overrides = {}) {
  const state = { status: "in-transit", bookingStatus: "booked", profile: true, boarded: false, writes: 0,
    profileFilter: null, tripFilter: null, bookingFilter: null, ...overrides };
  const booking = () => ({ ticketId: "TICKET-1", status: state.bookingStatus, boardingConfirmed: state.boarded,
    boardingConfirmedAt: "original", passengers: [], seatNumbers: ["A1"], paymentMethod: "cash" });
  const controller = createConductorController({
    ConductorProfile: { findOne(filter) { state.profileFilter = filter; return query(state.profile ? { brandId: "brand", ownerId: "owner" } : null); } },
    Trip: { findOne(filter) { state.tripFilter = filter; return query({ _id: tripId, status: state.status }); } },
    Booking: {
      findOne(filter) { state.bookingFilter = filter; return query(state.bookingStatus === filter.status ? booking() : null); },
      find(filter) { state.bookingFilter = filter; return query(state.bookingStatus === filter.status ? [booking()] : []); },
      async findOneAndUpdate(filter, update, options) {
        state.writes++; state.writeFilter = filter; state.update = update;
        assert.equal(options.runValidators, true);
        if (state.concurrentCancellation) { state.bookingStatus = "cancelled"; return null; }
        if (state.concurrentScan) { state.boarded = true; return null; }
        return { ...booking(), ...update.$set };
      },
    }, logger: { error() {} },
  });
  return { state, controller };
}
test("conductor scope includes active status, removal state and explicit trip assignment", async () => {
  const { state, controller } = fixture(); const res = response();
  await controller.confirmBoarding(req(), res);
  assert.equal(res.code, 200);
  assert.deepEqual(state.profileFilter, { userId, accessStatus: "ACTIVE",
    status: { $in: ["AVAILABLE", "ON_DUTY"] }, removedAt: null, assignedTripIds: tripId });
  assert.deepEqual(state.tripFilter, { _id: tripId, brandId: "brand", ownerId: "owner" });
  assert.equal(state.writeFilter.status, "booked");
  assert.deepEqual(state.writeFilter.boardingConfirmed, { $ne: true });
  assert.equal(state.update.$set.boardingConfirmedBy, userId);
});
test("unassigned or inactive conductor cannot read passenger data or board", async () => {
  const { state, controller } = fixture({ profile: false });
  for (const method of ["confirmBoarding", "getTripManifest"]) {
    const res = response(); await controller[method](req(), res); assert.equal(res.code, 403);
  }
  assert.equal(state.tripFilter, null); assert.equal(state.bookingFilter, null); assert.equal(state.writes, 0);
});
for (const status of ["pending", "cancelled", "no_show"]) {
  test(`${status} booking cannot board or appear on manifest`, async () => {
    const { state, controller } = fixture({ bookingStatus: status });
    const boarding = response(); await controller.confirmBoarding(req(), boarding);
    assert.equal(boarding.code, 404); assert.equal(state.writes, 0);
    const manifest = response(); await controller.getTripManifest(req(), manifest);
    assert.equal(manifest.code, 200); assert.equal(state.bookingFilter.status, "booked");
    assert.deepEqual(manifest.body.data.manifest, []);
  });
}
for (const status of ["boarding", "in-transit", "in_transit"]) {
  test(`boarding accepts ${status}`, async () => {
    const { controller } = fixture({ status }); const res = response();
    await controller.confirmBoarding(req(), res); assert.equal(res.code, 200);
  });
}
for (const status of ["scheduled", "completed", "cancelled"]) {
  test(`boarding rejects ${status}`, async () => {
    const { state, controller } = fixture({ status }); const res = response();
    await controller.confirmBoarding(req(), res); assert.equal(res.code, 400); assert.equal(state.writes, 0);
  });
}
test("duplicate scan preserves original boarding stamp", async () => {
  const { state, controller } = fixture({ boarded: true }); const res = response();
  await controller.confirmBoarding(req(), res);
  assert.equal(res.code, 200); assert.equal(res.body.data.boardingConfirmedAt, "original"); assert.equal(state.writes, 0);
});
test("cancellation between read and write is not overwritten", async () => {
  const { controller } = fixture({ concurrentCancellation: true }); const res = response();
  await controller.confirmBoarding(req(), res); assert.equal(res.code, 409);
});
test("concurrent duplicate scan returns original stamp", async () => {
  const { controller } = fixture({ concurrentScan: true }); const res = response();
  await controller.confirmBoarding(req(), res); assert.equal(res.code, 200);
  assert.equal(res.body.data.boardingConfirmedAt, "original");
});
test("owner override is scoped to owned trip, not conductor brand access", async () => {
  const { state, controller } = fixture(); const res = response();
  await controller.confirmBoarding({ ...req(), userInfo: { id: userId, activeRole: "busOwner" } }, res);
  assert.deepEqual(state.tripFilter, { _id: tripId, ownerId: userId }); assert.equal(state.profileFilter, null);
});
test("unrelated role and malformed ticket/trip inputs are rejected before database access", async () => {
  const { state, controller } = fixture();
  for (const input of [
    { ...req(), userInfo: { id: userId, activeRole: "passenger" } },
    { ...req(), body: { tripId: { $ne: null }, ticketId: "TICKET-1" } },
    { ...req(), body: { tripId, ticketId: { $ne: null } } },
  ]) {
    const res = response(); await controller.confirmBoarding(input, res);
    assert.ok([400, 403, 404].includes(res.code));
  }
  assert.equal(state.bookingFilter, null);
});
test("conductor trip assignment is owner/brand scoped and idempotent", async () => {
  let update;
  const controller = createConductorTripController({
    ConductorProfile: {
      findOne(filter) { assert.equal(filter.ownerId, userId); assert.equal(filter.accessStatus, "ACTIVE"); return query({ brandId: "brand" }); },
      async findOneAndUpdate(filter, value) { update = value; assert.equal(filter.brandId, "brand"); return {}; },
    },
    Trip: { findOne(filter) { assert.deepEqual(filter, { _id: tripId, ownerId: userId, brandId: "brand" });
      return query({ status: "scheduled" }); } },
    logger: { error() {} },
  });
  const res = response();
  await controller.assignConductorTrip({ userInfo: { id: userId }, params: { profileId, tripId } }, res);
  assert.equal(res.code, 200); assert.deepEqual(update.$addToSet, { assignedTripIds: tripId });
});
