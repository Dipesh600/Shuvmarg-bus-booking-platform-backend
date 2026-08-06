"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { registerBusOwnerFrontendReadRoutes } = require("../../../routes/busOwner/frontendReadRoutes.js");
const { mapLegacyFleetDetailRequest } = require("../../../src/modules/read-contracts/routes/legacy-read-request.adapter.js");

function inspectLayer(router, method, pathPattern) {
  return router.stack.find(
    (layer) => layer.route && layer.route.methods[method.toLowerCase()] && layer.route.path === pathPattern
  );
}

test("Bus-owner read routes registration & middleware contract", async (t) => {
  const router = express.Router();
  registerBusOwnerFrontendReadRoutes(router);

  await t.test("1. Canonical bus-owner profile & kyc routes registered", () => {
    assert.ok(inspectLayer(router, "GET", "/profile"));
    assert.ok(inspectLayer(router, "GET", "/kyc-status"));
    assert.ok(inspectLayer(router, "GET", "/myBusOwnerKycStatus"));
  });

  await t.test("2. Canonical bus-owner fleet routes registered", () => {
    assert.ok(inspectLayer(router, "GET", "/fleets"));
    assert.ok(inspectLayer(router, "GET", "/fleets/:fleetId"));
    assert.ok(inspectLayer(router, "GET", "/myFleets"));
    assert.ok(inspectLayer(router, "POST", "/getFleetById"));
  });

  await t.test("3. Profile and KYC status available before requireApprovedBusOwner", () => {
    const profileLayer = inspectLayer(router, "GET", "/profile");
    const kycLayer = inspectLayer(router, "GET", "/kyc-status");

    assert.equal(profileLayer.route.stack.length, 1);
    assert.equal(kycLayer.route.stack.length, 1);
  });

  await t.test("4. Fleet routes require requireApprovedBusOwner", () => {
    const fleetsLayer = inspectLayer(router, "GET", "/fleets");
    const fleetDetailLayer = inspectLayer(router, "GET", "/fleets/:fleetId");

    assert.ok(fleetsLayer.route.stack.length > 1);
    assert.ok(fleetDetailLayer.route.stack.length > 1);

    const hasApprovalCheck = fleetDetailLayer.route.stack.some(
      (s) => s.name === "requireApprovedBusOwner"
    );
    assert.equal(hasApprovalCheck, true);
  });

  await t.test("5. Legacy POST /getFleetById alias includes mapLegacyFleetDetailRequest adapter", () => {
    const aliasLayer = inspectLayer(router, "POST", "/getFleetById");
    const hasAdapter = aliasLayer.route.stack.some(
      (s) => s.handle === mapLegacyFleetDetailRequest
    );
    assert.equal(hasAdapter, true);
  });
});
