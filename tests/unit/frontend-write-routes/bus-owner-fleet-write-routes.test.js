"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { registerBusOwnerApprovedFleetRoutes } = require("../../../routes/busOwner/frontendFleetRoutes.js");
const { mapLegacyFleetUpdateRequest, mapLegacyFleetDeleteRequest } = require("../../../src/modules/bus-owner/fleet-management/legacy-fleet-write-request.adapter.js");

function inspectLayer(router, method, pathPattern) {
  return router.stack.find(
    (layer) => layer.route && layer.route.methods[method.toLowerCase()] && layer.route.path === pathPattern
  );
}

test("Bus-owner fleet write routes registration contract", async (t) => {
  const router = express.Router();
  registerBusOwnerApprovedFleetRoutes(router);

  await t.test("1. Canonical write routes registered", () => {
    assert.ok(inspectLayer(router, "POST", "/fleets"));
    assert.ok(inspectLayer(router, "PATCH", "/fleets/:fleetId"));
    assert.ok(inspectLayer(router, "DELETE", "/fleets/:fleetId"));
  });

  await t.test("1a. Setup-status uses the approved-owner middleware and shared controller", () => {
    const setupStatus = inspectLayer(router, "GET", "/fleets/:fleetId/setup-status");
    assert.ok(setupStatus);
    assert.equal(setupStatus.route.stack.length, 2);
  });

  await t.test("2. Legacy write aliases registered", () => {
    assert.ok(inspectLayer(router, "POST", "/submitFleetForVerification"));
    assert.ok(inspectLayer(router, "PATCH", "/updateFleet"));
    assert.ok(inspectLayer(router, "DELETE", "/deleteFleet"));
  });

  await t.test("3. Canonical and alias routes use correct terminal handler functions", () => {
    const postFleets = inspectLayer(router, "POST", "/fleets");
    const postSubmit = inspectLayer(router, "POST", "/submitFleetForVerification");
    const patchFleets = inspectLayer(router, "PATCH", "/fleets/:fleetId");
    const patchUpdate = inspectLayer(router, "PATCH", "/updateFleet");
    const delFleets = inspectLayer(router, "DELETE", "/fleets/:fleetId");
    const delDelete = inspectLayer(router, "DELETE", "/deleteFleet");

    const getTerminalHandler = (layer) => layer.route.stack[layer.route.stack.length - 1].handle;

    assert.notEqual(getTerminalHandler(postFleets), getTerminalHandler(postSubmit));
    assert.equal(getTerminalHandler(patchFleets), getTerminalHandler(patchUpdate));
    assert.equal(getTerminalHandler(delFleets), getTerminalHandler(delDelete));
  });

  await t.test("4. Legacy write aliases include transport adapters", () => {
    const patchUpdate = inspectLayer(router, "PATCH", "/updateFleet");
    const delDelete = inspectLayer(router, "DELETE", "/deleteFleet");

    const hasPatchAdapter = patchUpdate.route.stack.some((s) => s.handle === mapLegacyFleetUpdateRequest);
    const hasDelAdapter = delDelete.route.stack.some((s) => s.handle === mapLegacyFleetDeleteRequest);

    assert.equal(hasPatchAdapter, true);
    assert.equal(hasDelAdapter, true);
  });
});
