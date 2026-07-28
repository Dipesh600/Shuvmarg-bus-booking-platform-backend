"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTripStatusService,
} = require("../../src/modules/admin/fleet-workstation/trip-status.service");
const {
  createDriverAssignmentService,
} = require("../../src/modules/admin/fleet-workstation/driver-assignment.service");
const transitionPolicy = require("../../src/modules/admin/fleet-workstation/trip-transition.policy");

const statusService = (trip, calls) =>
  createTripStatusService({
    Trip: { findOne: async () => trip },
    transitionPolicy,
    cancellationService: {
      cancelBookings: async (id) => calls.push(["cancel", id]),
    },
    referralService: {
      processCompletion: async (id) => calls.push(["referral", id]),
    },
    clock: () => new Date("2026-07-27T12:00:00Z"),
  });

test("trip status service preserves not-found and transition responses", async () => {
  const missing = await statusService(null, []).updateStatus({
    fleetId: "f1",
    tripId: "t1",
    status: "boarding",
  });
  assert.deepEqual(missing, { statusCode: 404, message: "Trip not found." });
  const invalid = await statusService(
    { status: "completed" },
    []
  ).updateStatus({ fleetId: "f1", tripId: "t1", status: "boarding" });
  assert.deepEqual(invalid, {
    statusCode: 400,
    message: "Invalid transition from completed to boarding",
  });
});

test("trip completion timestamps, saves, then unlocks referrals", async () => {
  const calls = [];
  const trip = {
    _id: "t1",
    status: "in-transit",
    save: async () => calls.push(["save"]),
  };
  const result = await statusService(trip, calls).updateStatus({
    fleetId: "f1",
    tripId: "t1",
    status: "completed",
  });
  assert.equal(trip.actualArrivalTime.toISOString(), "2026-07-27T12:00:00.000Z");
  assert.equal(trip.status, "completed");
  assert.deepEqual(calls, [["save"], ["referral", "t1"]]);
  assert.equal(result.trip, trip);
});

test("trip cancellation preserves metadata and refund ordering", async () => {
  const calls = [];
  const trip = {
    _id: "t2",
    status: "scheduled",
    save: async () => calls.push(["save"]),
  };
  await statusService(trip, calls).updateStatus({
    fleetId: "f1",
    tripId: "t2",
    status: "cancelled",
    adminId: "admin-1",
  });
  assert.equal(trip.cancelledBy, "admin-1");
  assert.equal(
    trip.cancellationReason,
    "Cancelled by admin via Workstation"
  );
  assert.deepEqual(calls, [["cancel", "t2"], ["save"]]);
});

test("driver reassignment preserves brand guard and audit entry", async () => {
  const trip = {
    brandId: "brand-1",
    driverAssignmentLog: [],
    save: async () => {},
  };
  let driverQuery;
  const service = createDriverAssignmentService({
    Trip: { findOne: async () => trip },
    DriverProfile: {
      findOne: async (query) => {
        driverQuery = query;
        return { _id: "driver-1" };
      },
    },
    clock: () => new Date("2026-07-27T12:00:00Z"),
  });
  const result = await service.reassign({
    fleetId: "fleet-1",
    tripId: "trip-1",
    driverId: "driver-1",
    adminId: "admin-1",
  });
  assert.deepEqual(driverQuery, { _id: "driver-1", brandId: "brand-1" });
  assert.equal(result.trip, trip);
  assert.equal(trip.driverId, "driver-1");
  assert.deepEqual(trip.driverAssignmentLog[0], {
    driverId: "driver-1",
    assignedAt: new Date("2026-07-27T12:00:00Z"),
    assignedBy: "admin-1",
    reason: "Manual reassignment via Workstation",
  });
});
