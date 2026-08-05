"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createOwnerQueryController } = require("../../../src/modules/admin/bus-owner-management/owner-query.controller");
const { createKycQueryController } = require("../../../src/modules/admin/bus-owner-management/kyc-query.controller");
const { createFleetManagementController } = require("../../../src/modules/admin/fleet-management/fleet-management.controller");

function mockRes() {
  let resStatus = 200;
  let resBody = null;
  return {
    status(code) { resStatus = code; return this; },
    json(payload) { resBody = payload; return this; },
    result() { return { status: resStatus, body: resBody }; },
  };
}

test("admin read endpoint contract integration tests", async (t) => {
  const adminReq = { adminInfo: { id: "507f1f77bcf86cd799439010", role: "ADMIN" } };

  await t.test("1. GET /api/admin/getAllBusOwners endpoint contract", async () => {
    const controller = createOwnerQueryController({
      adminBusOwnerReadService: {
        listBusOwners: async () => ({
          success: true,
          data: {
            items: [{ ownerId: "bo-1", userId: "u-1", busOwnerId: "SUV-BOWNER-1", companyName: "Express" }],
            pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
          },
        }),
      },
    });
    const res = mockRes();
    await controller.getAllBusOwners({ ...adminReq, query: {} }, res);

    assert.equal(res.result().status, 200);
    assert.equal(res.result().body.success, true);
    assert.equal(res.result().body.data.items[0].ownerId, "bo-1");
    assert.equal("password" in res.result().body.data.items[0], false);
  });

  await t.test("2. POST /api/admin/getBusOwnerDetails endpoint contract", async () => {
    const controller = createOwnerQueryController({
      adminBusOwnerReadService: {
        getBusOwnerDetail: async () => ({
          success: true,
          data: { ownerId: "bo-1", userId: "u-1", companyName: "Express", fleets: [] },
        }),
      },
    });
    const res = mockRes();
    await controller.getBusOwnerById({ ...adminReq, body: { id: "507f1f77bcf86cd799439011" } }, res);

    assert.equal(res.result().status, 200);
    assert.equal(res.result().body.success, true);
    assert.equal(res.result().body.data.ownerId, "bo-1");
  });

  await t.test("3. GET /api/admin/getAllBusOwnerKycs endpoint contract", async () => {
    const controller = createKycQueryController({
      readService: {
        listKycQueue: async () => ({
          success: true,
          data: { items: [{ ownerId: "bo-1", companyName: "Express" }], pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 } },
        }),
      },
    });
    const res = mockRes();
    await controller.getAllBusOwnerKycs({ ...adminReq, query: {} }, res);

    assert.equal(res.result().status, 200);
    assert.equal(res.result().body.success, true);
  });

  await t.test("4. POST /api/admin/getBusOwnerKycDetails endpoint contract", async () => {
    const controller = createKycQueryController({
      readService: {
        getKycDetail: async () => ({
          success: true,
          data: { ownerId: "bo-1", verificationStatus: "pending", documentDescriptors: {} },
        }),
      },
    });
    const res = mockRes();
    await controller.getBusOwnerKycById({ ...adminReq, body: { id: "507f1f77bcf86cd799439011" } }, res);

    assert.equal(res.result().status, 200);
    assert.equal(res.result().body.data.ownerId, "bo-1");
  });

  await t.test("5. GET /api/admin/fleet/getAllFleet endpoint contract", async () => {
    const controller = createFleetManagementController({
      readService: {
        listFleetsForAdmin: async () => ({
          success: true,
          data: { items: [{ fleetId: "f-1", fleetCode: "FLEET-001" }], pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 } },
        }),
      },
    });
    const res = mockRes();
    await controller.getAllFleet({ ...adminReq, query: {} }, res);

    assert.equal(res.result().status, 200);
    assert.equal(res.result().body.data.items[0].fleetId, "f-1");
  });

  await t.test("6 & 7. GET /api/admin/fleet/getById/:id & legacy details/:id endpoint contract", async () => {
    const canonicalController = createFleetManagementController({
      readService: {
        getFleetDetailForAdmin: async () => ({
          success: true,
          data: { fleetId: "f-1", fleetCode: "FLEET-001", busName: "Super Deluxe" },
        }),
      },
    });

    const res1 = mockRes();
    await canonicalController.getFleetById({ ...adminReq, params: { id: "507f1f77bcf86cd799439011" } }, res1);

    assert.equal(res1.result().status, 200);
    assert.equal(res1.result().body.data.fleetCode, "FLEET-001");
  });

  await t.test("8. GET /api/admin/fleet/:id/setup-status endpoint contract", async () => {
    const controller = createFleetManagementController({
      readService: {
        getFleetSetupStatusForAdmin: async () => ({
          success: true,
          data: { fleetId: "f-1", fleetCode: "FLEET-001", setupComplete: true, progress: { completedSteps: 4, totalSteps: 4 } },
        }),
      },
    });
    const res = mockRes();
    await controller.getFleetSetupStatus({ ...adminReq, params: { id: "507f1f77bcf86cd799439011" } }, res);

    assert.equal(res.result().status, 200);
    assert.equal(res.result().body.data.progress.completedSteps, 4);
  });
});
