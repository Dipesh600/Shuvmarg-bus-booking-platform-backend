"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createCrewDirectoryController } = require("../../../src/modules/bus-owner/crew/crew-directory.controller");
const ownerId = "650000000000000000000001", brandId = "650000000000000000000002";
const profileId = "650000000000000000000003", userId = "650000000000000000000004";
const response = () => ({ code: 0, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const chain = value => ({ sort() { return this; }, skip() { return this; }, limit() { return this; },
  populate() { return this; }, lean: async () => value });
function fixture(profiles = []) {
  const state = { finds: [], counts: [], updates: [] };
  const model = {
    find(filter) { state.finds.push(filter); return chain(profiles); },
    async countDocuments(filter) { state.counts.push(filter); return profiles.length; },
    findOneAndUpdate(filter, update, options) {
      state.updates.push({ filter, update, options });
      return { lean: async () => profiles[0] || null };
    },
  };
  return { state, controller: createCrewDirectoryController({
    DriverProfile: model, ConductorProfile: model, logger: { error() {} },
  }) };
}
test("driver directory is owner scoped, paginated, escaped and allowlisted", async () => {
  const { state, controller } = fixture([{
    _id: profileId, ownerId, brandId, userId: { _id: userId, status: "active", phoneVerified: true },
    fullName: "Driver Person", phone: "9800000001", status: "AVAILABLE", approvalStatus: "APPROVED",
    accessStatus: "ACTIVE", invitationDeliveryStatus: "NOT_REQUIRED",
    licenseNumber: "NL123", licenseType: "HV", licenseExpiry: "2099-01-01",
    password: "must-not-leak", notes: "private", documents: { license: { url: "private-key" } },
  }]);
  const res = response();
  await controller.listCrew({ userInfo: { id: ownerId }, query: {
    role: "driver", brandId, status: "AVAILABLE", search: "Driver.*", page: "1", limit: "20",
  } }, res);
  assert.equal(res.code, 200);
  assert.equal(state.finds[0].ownerId, ownerId); assert.equal(state.finds[0].brandId, brandId);
  assert.equal(state.finds[0].status, "AVAILABLE");
  assert.equal(state.finds[0].$or[0].fullName.source, "Driver\\.\\*");
  assert.deepEqual(res.body.pagination, { page: 1, limit: 20, total: 1, totalPages: 1 });
  assert.deepEqual(res.body.data[0], {
    id: profileId, userId, role: "driver", fullName: "Driver Person", phone: "9800000001",
    email: null, brandId, status: "AVAILABLE", accessStatus: "ACTIVE",
    invitationDeliveryStatus: "NOT_REQUIRED", phoneVerified: true, removedAt: null,
    invitedAt: null, activatedAt: null, invitationLastAttemptAt: null,
    createdAt: undefined, approvalStatus: "APPROVED", licenseNumber: "NL123",
    licenseType: "HV", licenseExpiry: "2099-01-01", gender: null, experienceYears: 0,
    assignedBusId: null,
  });
});
test("conductor directory maps assigned trip summaries without exposing booking data", async () => {
  const { controller } = fixture([{ _id: profileId, brandId, fullName: "Crew Person", phone: "9800000001",
    status: "ON_DUTY", assignedTripIds: [{ _id: "trip", tripId: "T-1", tripDate: "2026-09-04",
      departureTime: "08:00", arrivalTime: "12:00", status: "boarding",
      busId: { _id: "bus", busName: "Express", busNumber: "BA-1" },
      routeId: { _id: "route", routeName: "Kathmandu–Pokhara", fromCity: "Kathmandu", toCity: "Pokhara" },
      bookings: ["secret"] }] }]);
  const res = response();
  await controller.listCrew({ userInfo: { id: ownerId }, query: { role: "conductor" } }, res);
  assert.equal(res.code, 200); assert.equal(res.body.data[0].assignedTrips.length, 1);
  assert.equal(res.body.data[0].assignedTrips[0].bus.number, "BA-1");
  assert.equal("bookings" in res.body.data[0].assignedTrips[0], false);
});
for (const query of [
  { role: "admin" }, { role: "driver", page: "0" }, { role: "driver", limit: "51" },
  { role: "driver", brandId: "bad" }, { role: "driver", status: "DELETED" },
  { role: "driver", search: "x".repeat(101) },
]) test("invalid directory query is rejected before database access", async () => {
  const { state, controller } = fixture(); const res = response();
  await controller.listCrew({ userInfo: { id: ownerId }, query }, res);
  assert.equal(res.code, 400); assert.equal(state.finds.length, 0);
});
test("owner may set only available or off-duty on an active owned profile", async () => {
  const { state, controller } = fixture([{ _id: profileId, status: "OFF_DUTY" }]); const res = response();
  await controller.updateCrewStatus({ userInfo: { id: ownerId }, params: { role: "driver", profileId },
    body: { status: "OFF_DUTY" } }, res);
  assert.equal(res.code, 200); assert.deepEqual(state.updates[0].filter, {
    _id: profileId, ownerId, removedAt: null, status: { $in: ["AVAILABLE", "OFF_DUTY"] },
  }); assert.deepEqual(state.updates[0].update.$inc, { __v: 1 });
});
for (const status of ["ON_DUTY", "INACTIVE", "SUSPENDED", "APPROVED", undefined]) {
  test(`owner cannot manually set ${status || "missing"} status`, async () => {
    const { state, controller } = fixture([{ _id: profileId }]); const res = response();
    await controller.updateCrewStatus({ userInfo: { id: ownerId }, params: { role: "conductor", profileId },
      body: { status } }, res);
    assert.equal(res.code, 400); assert.equal(state.updates.length, 0);
  });
}
test("wrong-owner or protected profile is returned as not found", async () => {
  const { controller } = fixture([]); const res = response();
  await controller.updateCrewStatus({ userInfo: { id: ownerId }, params: { role: "driver", profileId },
    body: { status: "AVAILABLE" } }, res);
  assert.equal(res.code, 404);
});
