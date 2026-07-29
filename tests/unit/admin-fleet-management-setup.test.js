"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFleetSetupService,
  nextSetupStep,
} = require("../../src/modules/admin/fleet-management/fleet-setup.service");

test("setup step ordering preserves the exact wizard sequence", () => {
  const base = {
    routeAssigned: true,
    routeConfigured: true,
    driverAssigned: true,
    scheduleCreated: true,
    activated: true,
  };
  assert.equal(nextSetupStep({ ...base, routeAssigned: false }), "routeAssigned");
  assert.equal(
    nextSetupStep({ ...base, routeConfigured: false }),
    "routeConfigured"
  );
  assert.equal(nextSetupStep({ ...base, driverAssigned: false }), "driverAssigned");
  assert.equal(
    nextSetupStep({ ...base, scheduleCreated: false }),
    "scheduleCreated"
  );
  assert.equal(nextSetupStep({ ...base, activated: false }), "activated");
  assert.equal(nextSetupStep(base), "complete");
});

test("missing fleet preserves exact setup-status 404", async () => {
  const service = createFleetSetupService({
    repository: { findFleet: async () => null },
  });
  assert.deepEqual(await service("missing"), {
    statusCode: 404,
    body: { success: false, message: "Fleet not found." },
  });
});

test("setup status preserves route, driver, schedule, and return activation", async () => {
  const calls = [];
  const fleet = {
    _id: "f1",
    busName: "Bus",
    busNumber: "BA-1",
    approvalStatus: "APPROVED",
    brandId: "b1",
    corridorId: { _id: "c1" },
  };
  const service = createFleetSetupService({
    repository: {
      findFleet: async () => fleet,
      findRouteConfigs: async () => [{ _id: "rc1" }],
      findAssignedDriver: async () => ({ _id: "d1" }),
      findSchedule: async () => ({
        _id: "s1",
        status: "INACTIVE",
        returnScheduleId: "s2",
      }),
      findReturnSchedule: async (id) => {
        calls.push(id);
        return { _id: id, status: "ACTIVE" };
      },
    },
  });
  const result = await service("f1");
  assert.deepEqual(calls, ["s2"]);
  assert.equal(result.body.data.nextStep, "complete");
  assert.equal(result.body.data.isFullyOperational, true);
  assert.deepEqual(result.body.data.steps, {
    routeAssigned: true,
    routeConfigured: true,
    driverAssigned: true,
    scheduleCreated: true,
    returnTripLinked: true,
    activated: true,
  });
});
