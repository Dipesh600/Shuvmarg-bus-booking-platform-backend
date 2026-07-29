"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const routes = require("../../routes/adminRoutes/adminRoutes.js");
const adminMiddleware = require("../../middleware/adminMiddleware.js");
const fleet = require("../../src/modules/admin/fleet-management");

test("admin fleet-management Express route contract", () => {
  const expected = [
    ["get", "/fleet/getAllFleet", fleet.getAllFleet],
    ["get", "/fleet/getById/:id", fleet.getFleetById],
    ["patch", "/fleet/update-status", fleet.updateFleetStatus],
    ["get", "/fleet/fleetDashboard", fleet.getFleetDashboard],
    ["get", "/fleet/:id/setup-status", fleet.getFleetSetupStatus],
  ];
  const layers = routes.stack.filter((layer) => layer.route);
  for (const [method, path, handler] of expected) {
    const matches = layers.filter(
      (layer) => layer.route.path === path && layer.route.methods[method]
    );
    assert.equal(
      matches.length,
      1,
      `${method.toUpperCase()} ${path} must exist exactly once`
    );
    assert.deepEqual(
      matches[0].route.stack.map((layer) => layer.handle),
      [adminMiddleware, handler]
    );
  }
});
