"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetReadService } = require("../../../src/modules/read-contracts/fleet/fleet-read.service");

test("fleet read service calls canonical setup service exactly once", async () => {
  let canonicalCallCount = 0;
  const service = createFleetReadService({
    repository: {},
    getCanonicalSetupStatus: async (id) => {
      canonicalCallCount++;
      return {
        statusCode: 200,
        body: { success: true, data: canonicalSetupData(id) },
      };
    },
    resolveAdminActor: async () => ({ status: "active", isLocked: false }),
  });

  const response = await service.getFleetSetupStatusForAdmin({
    adminInfo: { id: "admin1", role: "ADMIN" },
    params: { id: "507f1f77bcf86cd799439011" },
  });

  assert.equal(canonicalCallCount, 1);
  assert.equal(response.success, true);
  assert.equal(response.data.fleetId, "507f1f77bcf86cd799439011");
  assert.equal(response.data.progress.completedSteps, 4);
  assert.equal(response.data.progress.totalSteps, 5);
  assert.equal(response.data.progress.percentage, 80);
  assert.equal(response.data.nextStep, "activated");
});

function canonicalSetupData(fleetId) {
  return {
    fleetId,
    busName: "City Liner",
    busNumber: "BA 2 PA 5678",
    approvalStatus: "APPROVED",
    steps: {
      routeAssigned: true,
      routeConfigured: true,
      driverAssigned: true,
      scheduleCreated: true,
      returnTripLinked: false,
      activated: false,
    },
    nextStep: "activated",
    isFullyOperational: false,
  };
}
