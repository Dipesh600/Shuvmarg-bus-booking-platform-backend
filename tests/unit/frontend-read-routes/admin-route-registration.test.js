"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { registerAdminFrontendReadRoutes } = require("../../../routes/adminRoutes/frontendReadRoutes.js");
const {
  mapLegacyOwnerDetailRequest,
  mapLegacyKycDetailRequest,
  mapLegacyFleetDetailRequest,
  mapLegacyFleetSetupRequest,
} = require("../../../src/modules/read-contracts/routes/legacy-read-request.adapter.js");

function inspectRouterLayer(router, method, pathPattern) {
  return router.stack.find(
    (layer) => layer.route && layer.route.methods[method.toLowerCase()] && layer.route.path === pathPattern
  );
}

test("Admin read routes registration & middleware contract", async (t) => {
  const router = express.Router();
  registerAdminFrontendReadRoutes(router);

  await t.test("1. Canonical admin bus-owner routes registered", () => {
    assert.ok(inspectRouterLayer(router, "GET", "/bus-owners"));
    assert.ok(inspectRouterLayer(router, "GET", "/bus-owners/:ownerId"));
    assert.ok(inspectRouterLayer(router, "GET", "/getAllBusOwners"));
    assert.ok(inspectRouterLayer(router, "POST", "/getBusOwnerDetails"));
  });

  await t.test("2. Canonical admin KYC routes registered", () => {
    assert.ok(inspectRouterLayer(router, "GET", "/bus-owner-kycs"));
    assert.ok(inspectRouterLayer(router, "GET", "/bus-owner-kycs/:kycId"));
    assert.ok(inspectRouterLayer(router, "GET", "/getAllBusOwnerKycs"));
    assert.ok(inspectRouterLayer(router, "POST", "/getBusOwnerKycDetails"));
  });

  await t.test("3. Canonical admin fleet routes registered", () => {
    assert.ok(inspectRouterLayer(router, "GET", "/fleets"));
    assert.ok(inspectRouterLayer(router, "GET", "/fleets/:fleetId/setup-status"));
    assert.ok(inspectRouterLayer(router, "GET", "/fleets/:fleetId"));
    assert.ok(inspectRouterLayer(router, "GET", "/fleet/getAllFleet"));
    assert.ok(inspectRouterLayer(router, "GET", "/fleet/:id/setup-status"));
    assert.ok(inspectRouterLayer(router, "GET", "/fleet/getById/:id"));
    assert.ok(inspectRouterLayer(router, "GET", "/fleet/details/:id"));
  });

  await t.test("4. Canonical detail reads use GET with named path parameters", () => {
    const ownerDetail = inspectRouterLayer(router, "GET", "/bus-owners/:ownerId");
    assert.equal(ownerDetail.route.methods.get, true);
    assert.equal(ownerDetail.route.path.includes(":ownerId"), true);

    const kycDetail = inspectRouterLayer(router, "GET", "/bus-owner-kycs/:kycId");
    assert.equal(kycDetail.route.methods.get, true);
    assert.equal(kycDetail.route.path.includes(":kycId"), true);

    const fleetDetail = inspectRouterLayer(router, "GET", "/fleets/:fleetId");
    assert.equal(fleetDetail.route.methods.get, true);
    assert.equal(fleetDetail.route.path.includes(":fleetId"), true);
  });

  await t.test("5. Legacy alias routes include domain-specific request adapters", () => {
    const ownerAlias = inspectRouterLayer(router, "POST", "/getBusOwnerDetails");
    assert.equal(ownerAlias.route.stack[1].handle, mapLegacyOwnerDetailRequest);

    const kycAlias = inspectRouterLayer(router, "POST", "/getBusOwnerKycDetails");
    assert.equal(kycAlias.route.stack[1].handle, mapLegacyKycDetailRequest);

    const fleetDetailAlias = inspectRouterLayer(router, "GET", "/fleet/getById/:id");
    assert.equal(fleetDetailAlias.route.stack[1].handle, mapLegacyFleetDetailRequest);

    const fleetSetupAlias = inspectRouterLayer(router, "GET", "/fleet/:id/setup-status");
    assert.equal(fleetSetupAlias.route.stack[1].handle, mapLegacyFleetSetupRequest);
  });
});
