"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBusOwnerReadService } = require("../../../src/modules/read-contracts/bus-owner/bus-owner-read.service");
const { createKycSubmissionController } = require("../../../src/modules/bus-owner/kyc-submission/kyc-submission.controller");
const { createFleetManagementController } = require("../../../src/modules/bus-owner/fleet-management/fleet-management.controller");

function mockRes() {
  let resStatus = 200;
  let resBody = null;
  return {
    status(code) { resStatus = code; return this; },
    json(payload) { resBody = payload; return this; },
    result() { return { status: resStatus, body: resBody }; },
  };
}

test("bus owner read endpoint contract integration tests", async (t) => {
  const ownerReq = { userInfo: { id: "507f1f77bcf86cd799439020", role: "BUS_OWNER" } };

  await t.test("9. GET /api/busowner/profile endpoint contract", async () => {
    const service = createBusOwnerReadService({
      UserModel: {
        findById: () => ({
          select: () => ({
            lean: async () => ({
              _id: "507f1f77bcf86cd799439020",
              name: "John Owner",
              email: "john@example.com",
            }),
          }),
        }),
      },
      BusOwnerModel: {
        findOne: () => ({
          lean: async () => ({
            _id: "507f1f77bcf86cd799439011",
            busOwnerId: "SUV-BOWNER-20",
            companyName: "Express Travels",
            verificationStatus: "approved",
          }),
        }),
      },
    });

    const res = mockRes();
    const result = await service.getOwnProfile(ownerReq);
    res.status(200).json(result);

    assert.equal(res.result().status, 200);
    assert.equal(res.result().body.success, true);
    assert.equal(res.result().body.data.ownerId, "507f1f77bcf86cd799439011");
    assert.equal(res.result().body.data.userId, "507f1f77bcf86cd799439020");
    assert.equal("password" in res.result().body.data, false);
  });

  await t.test("10. GET /api/busowner/myBusOwnerKycStatus endpoint contract", async () => {
    const controller = createKycSubmissionController({
      BusOwner: {
        findOne: () => ({
          lean: async () => ({
            _id: "bo-20",
            verificationStatus: "approved",
            companyRegistration: { documentUrls: ["a.pdf"] },
          }),
        }),
      },
    });

    const res = mockRes();
    await controller.getMyBusOwnerKycStatus(ownerReq, res);

    assert.equal(res.result().status, 200);
    assert.equal(res.result().body.success, true);
    assert.equal(res.result().body.data.verificationStatus, "approved");
  });

  await t.test("11. GET /api/busowner/myFleets endpoint contract", async () => {
    const controller = createFleetManagementController({
      readService: {
        listFleetsForOwner: async () => ({
          success: true,
          data: {
            items: [{ fleetId: "f-20", fleetCode: "FLEET-020", busName: "Deluxe" }],
            pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
          },
        }),
      },
    });

    const res = mockRes();
    await controller.getMyFleets({ ...ownerReq, query: {} }, res);

    assert.equal(res.result().status, 200);
    assert.equal(res.result().body.success, true);
    assert.equal(res.result().body.data.items[0].fleetId, "f-20");
  });

  await t.test("12. POST /api/busowner/getFleetById endpoint contract", async () => {
    const controller = createFleetManagementController({
      readService: {
        getFleetDetailForOwner: async () => ({
          success: true,
          data: { fleetId: "f-20", fleetCode: "FLEET-020", busName: "Deluxe", setupComplete: true },
        }),
      },
    });

    const res = mockRes();
    await controller.getFleetById({ ...ownerReq, body: { fleetId: "507f1f77bcf86cd799439011" } }, res);

    assert.equal(res.result().status, 200);
    assert.equal(res.result().body.success, true);
    assert.equal(res.result().body.data.fleetId, "f-20");
    assert.equal(res.result().body.data.fleetCode, "FLEET-020");
  });

  await t.test("13. GET /api/busowner/fleets/:fleetId/setup-status uses the shared setup contract", async () => {
    const controller = createFleetManagementController({
      readService: {
        getFleetSetupStatusForOwner: async () => ({
          success: true,
          data: {
            fleetId: "f-20",
            setupComplete: false,
            nextStep: "routeConfigured",
            progress: { completedSteps: 1, totalSteps: 5, percentage: 20 },
          },
        }),
      },
    });

    const res = mockRes();
    await controller.getFleetSetupStatus({
      ...ownerReq,
      params: { fleetId: "507f1f77bcf86cd799439011" },
    }, res);

    assert.equal(res.result().status, 200);
    assert.equal(res.result().body.success, true);
    assert.equal(res.result().body.data.nextStep, "routeConfigured");
    assert.equal(res.result().body.data.progress.percentage, 20);
  });
});
