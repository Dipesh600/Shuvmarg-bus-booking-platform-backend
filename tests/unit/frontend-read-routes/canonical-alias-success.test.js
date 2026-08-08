"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { createOwnerQueryController } = require("../../../src/modules/admin/bus-owner-management/owner-query.controller.js");
const { createFleetManagementController } = require("../../../src/modules/bus-owner/fleet-management/fleet-management.controller.js");
const { registerAdminFrontendReadRoutes } = require("../../../routes/adminRoutes/frontendReadRoutes.js");

function mockRes() {
  let statusVal = 200;
  let bodyVal = null;
  return {
    status(code) { statusVal = code; return this; },
    json(payload) { bodyVal = payload; return this; },
    get result() { return { status: statusVal, body: bodyVal }; },
  };
}

function findHandler(router, method, path) {
  const layer = router.stack.find((l) => l.route && l.route.methods[method.toLowerCase()] && l.route.path === path);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

test("Canonical route and compatibility alias success equality", async (t) => {
  await t.test("1. Structural handler equality: aliases resolve to canonical controller methods", () => {
    const router = express.Router();
    registerAdminFrontendReadRoutes(router);

    assert.equal(findHandler(router, "GET", "/bus-owners"), findHandler(router, "GET", "/getAllBusOwners"));
    assert.equal(findHandler(router, "GET", "/bus-owners/:ownerId"), findHandler(router, "POST", "/getBusOwnerDetails"));
    assert.equal(findHandler(router, "GET", "/bus-owner-kycs"), findHandler(router, "GET", "/getAllBusOwnerKycs"));
    assert.equal(findHandler(router, "GET", "/bus-owner-kycs/:kycId"), findHandler(router, "POST", "/getBusOwnerKycDetails"));
    assert.equal(findHandler(router, "GET", "/fleets"), findHandler(router, "GET", "/fleet/getAllFleet"));
    assert.equal(findHandler(router, "GET", "/fleets/:fleetId"), findHandler(router, "GET", "/fleet/getById/:id"));
    assert.equal(findHandler(router, "GET", "/fleets/:fleetId/setup-status"), findHandler(router, "GET", "/fleet/:id/setup-status"));
  });

  await t.test("2. Admin bus owner detail success payload equality", async () => {
    const mockData = { ownerId: "bo-100", companyName: "Super Bus" };
    const controller = createOwnerQueryController({
      adminBusOwnerReadService: {
        getBusOwnerDetail: async () => ({ success: true, data: mockData }),
      },
    });

    const res1 = mockRes();
    const res2 = mockRes();
    await controller.getBusOwnerById({ params: { ownerId: "bo-100" } }, res1);
    await controller.getBusOwnerById({ params: { ownerId: "bo-100" } }, res2);

    assert.deepEqual(res1.result, res2.result);
    assert.equal(res1.result.status, 200);
    assert.equal(res1.result.body.success, true);
    assert.equal(res1.result.body.data.ownerId, "bo-100");
  });

  await t.test("3. Bus-owner fleet list success payload equality", async () => {
    const mockList = { items: [{ fleetId: "f-1" }], pagination: { page: 1, limit: 10, totalItems: 1, totalPages: 1 } };
    const controller = createFleetManagementController({
      readService: {
        listFleetsForOwner: async () => ({ success: true, data: mockList }),
      },
    });

    const res1 = mockRes();
    const res2 = mockRes();
    await controller.getMyFleets({ userInfo: { id: "u-1" }, query: {} }, res1);
    await controller.getMyFleets({ userInfo: { id: "u-1" }, query: {} }, res2);

    assert.deepEqual(res1.result, res2.result);
    assert.equal(res1.result.status, 200);
    assert.equal(res1.result.body.data.items[0].fleetId, "f-1");
  });
});
