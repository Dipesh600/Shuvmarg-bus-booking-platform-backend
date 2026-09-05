"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetReadService } = require("../../../src/modules/read-contracts/fleet/fleet-read.service");

test("owner setup status verifies ownership before reading canonical setup state", async () => {
  let canonicalCallCount = 0;
  const service = createFleetReadService({
    repository: {
      ownerOwnsFleet: async ({ fleetId, userId }) =>
        fleetId === "507f1f77bcf86cd799439011" &&
        userId === "507f1f77bcf86cd799439020",
    },
    getCanonicalSetupStatus: async (fleetId) => {
      canonicalCallCount += 1;
      return {
        statusCode: 200,
        body: { data: ownerSetupData(fleetId) },
      };
    },
  });

  const response = await service.getFleetSetupStatusForOwner({
    userInfo: { id: "507f1f77bcf86cd799439020" },
    params: { fleetId: "507f1f77bcf86cd799439011" },
  });

  assert.equal(canonicalCallCount, 1);
  assert.equal(response.data.nextStep, "routeConfigured");
  assert.equal(response.data.progress.percentage, 20);
});

test("owner setup status conceals fleets owned by another operator", async () => {
  let canonicalCallCount = 0;
  const service = createFleetReadService({
    repository: { ownerOwnsFleet: async () => false },
    getCanonicalSetupStatus: async () => {
      canonicalCallCount += 1;
      return null;
    },
  });

  await assert.rejects(
    service.getFleetSetupStatusForOwner({
      userInfo: { id: "507f1f77bcf86cd799439020" },
      params: { fleetId: "507f1f77bcf86cd799439011" },
    }),
    (error) => error?.code === "FLEET_NOT_FOUND"
  );
  assert.equal(canonicalCallCount, 0);
});

function ownerSetupData(fleetId) {
  return {
    fleetId,
    busName: "Owner Express",
    approvalStatus: "APPROVED",
    steps: {
      routeAssigned: true,
      routeConfigured: false,
      driverAssigned: false,
      scheduleCreated: false,
      activated: false,
    },
    nextStep: "routeConfigured",
  };
}
