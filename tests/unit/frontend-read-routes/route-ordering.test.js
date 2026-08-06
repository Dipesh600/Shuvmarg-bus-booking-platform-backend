"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { registerAdminFrontendReadRoutes } = require("../../../routes/adminRoutes/frontendReadRoutes.js");

function findLayerIndex(router, method, pathPattern) {
  return router.stack.findIndex(
    (layer) => layer.route && layer.route.methods[method.toLowerCase()] && layer.route.path === pathPattern
  );
}

test("Route order and static route collision prevention", async (t) => {
  const router = express.Router();
  registerAdminFrontendReadRoutes(router);

  await t.test("1. /fleets/:fleetId/setup-status registered before /fleets/:fleetId", () => {
    const setupIndex = findLayerIndex(router, "GET", "/fleets/:fleetId/setup-status");
    const detailIndex = findLayerIndex(router, "GET", "/fleets/:fleetId");

    assert.ok(setupIndex !== -1);
    assert.ok(detailIndex !== -1);
    assert.ok(setupIndex < detailIndex, "setup-status route must precede parameterized fleet detail route");
  });

  await t.test("2. /fleet/:id/setup-status alias registered before /fleet/getById/:id", () => {
    const aliasSetupIndex = findLayerIndex(router, "GET", "/fleet/:id/setup-status");
    const aliasDetailIndex = findLayerIndex(router, "GET", "/fleet/getById/:id");

    assert.ok(aliasSetupIndex !== -1);
    assert.ok(aliasDetailIndex !== -1);
    assert.ok(aliasSetupIndex < aliasDetailIndex);
  });

  await t.test("3. Static endpoints remain distinct from parameterized sub-paths", () => {
    const getAllIndex = findLayerIndex(router, "GET", "/fleets");
    const getDetailIndex = findLayerIndex(router, "GET", "/fleets/:fleetId");

    assert.ok(getAllIndex < getDetailIndex);
  });
});
