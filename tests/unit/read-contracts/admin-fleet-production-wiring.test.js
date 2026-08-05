"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const adminFleetModule = require("../../../src/modules/admin/fleet-management");

function mockResponse() {
  let statusCode;
  let body;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
    result: () => ({ statusCode, body }),
  };
}

async function invoke(handler, req = {}) {
  const res = mockResponse();
  await handler(req, res);
  return res.result();
}

test("production admin fleet management module wiring contract tests", async (t) => {
  await t.test("missing Admin actor returns 401 through the actual exported module handlers", async () => {
    const unauthReq = { query: {}, params: { id: "507f1f77bcf86cd799439011" } };

    const listRes = await invoke(adminFleetModule.getAllFleet, unauthReq);
    assert.equal(listRes.statusCode, 401);
    assert.equal(listRes.body.success, false);
    assert.equal(listRes.body.error.code, "UNAUTHORIZED_ADMIN");

    const detailRes = await invoke(adminFleetModule.getFleetById, unauthReq);
    assert.equal(detailRes.statusCode, 401);
    assert.equal(detailRes.body.success, false);
    assert.equal(detailRes.body.error.code, "UNAUTHORIZED_ADMIN");

    const setupRes = await invoke(adminFleetModule.getFleetSetupStatus, unauthReq);
    assert.equal(setupRes.statusCode, 401);
    assert.equal(setupRes.body.success, false);
    assert.equal(setupRes.body.error.code, "UNAUTHORIZED_ADMIN");
  });

  await t.test("active exported module handlers return stabilized DTO shapes and call canonical setup service", async () => {
    const { createFleetManagementController } = require("../../../src/modules/admin/fleet-management/fleet-management.controller");

    let canonicalSetupCalled = false;
    const mockCanonicalSetup = async (id) => {
      canonicalSetupCalled = true;
      return {
        statusCode: 200,
        body: {
          success: true,
          data: {
            fleetId: id,
            busName: "Express Alpha",
            busNumber: "BA 1 PA 1234",
            approvalStatus: "APPROVED",
            steps: {
              routeAssigned: true,
              routeConfigured: true,
              driverAssigned: true,
              scheduleCreated: true,
              returnTripLinked: true,
              activated: true,
            },
            nextStep: "complete",
            isFullyOperational: true,
          },
        },
      };
    };

    const mockRepo = {
      findAdminPaginatedFleets: async () => ({
        items: [
          {
            fleetId: "507f1f77bcf86cd799439011",
            fleetCode: "SUV-001",
            vehicleName: "Volvo B11R",
            registrationNumber: "BA 1 PA 1234",
            busOwnerName: "Ram Bahadur",
            approvalStatus: "APPROVED",
            status: "ACTIVE",
          },
        ],
        totalItems: 1,
      }),
      findAdminFleetDetailById: async (id) => ({
        fleetId: id,
        fleetCode: "SUV-001",
        vehicle: { busName: "Volvo B11R", busNumber: "BA 1 PA 1234" },
        assignment: { busOwnerName: "Ram Bahadur" },
        status: "ACTIVE",
        approvalStatus: "APPROVED",
        setupComplete: true,
      }),
    };

    const { createFleetReadService } = require("../../../src/modules/read-contracts/fleet/fleet-read.service");
    const readService = createFleetReadService({
      repository: mockRepo,
      getCanonicalSetupStatus: mockCanonicalSetup,
      resolveAdminActor: async () => ({ status: "active", isLocked: false }),
    });

    const controller = createFleetManagementController({ readService });

    const req = {
      adminInfo: { id: "admin_1", role: "ADMIN" },
      params: { id: "507f1f77bcf86cd799439011" },
      query: { page: "1", limit: "10" },
    };

    // 1. active getAllFleet returns data.items (AdminFleetListItem DTO)
    const listRes = await invoke(controller.getAllFleet, req);
    assert.equal(listRes.statusCode, 200);
    assert.equal(listRes.body.success, true);
    assert.ok(Array.isArray(listRes.body.data.items));
    assert.equal(listRes.body.data.items[0].fleetId, "507f1f77bcf86cd799439011");

    // 2. active getFleetById returns AdminFleetDetail
    const detailRes = await invoke(controller.getFleetById, req);
    assert.equal(detailRes.statusCode, 200);
    assert.equal(detailRes.body.success, true);
    assert.equal(detailRes.body.data.fleetId, "507f1f77bcf86cd799439011");
    assert.equal(detailRes.body.data.status, "ACTIVE");

    // 3. active setup-status returns FleetSetupStatus DTO and invokes canonical setup service through read-service
    const setupRes = await invoke(controller.getFleetSetupStatus, req);
    assert.equal(setupRes.statusCode, 200);
    assert.equal(setupRes.body.success, true);
    assert.equal(setupRes.body.data.fleetId, "507f1f77bcf86cd799439011");
    assert.equal(setupRes.body.data.setupComplete, true);
    assert.equal(setupRes.body.data.progress.percentage, 100);
    assert.equal(canonicalSetupCalled, true);
  });
});
