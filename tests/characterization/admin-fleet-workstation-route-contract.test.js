"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const routes = require("../../routes/adminRoutes/adminRoutes.js");
const adminMiddleware = require("../../middleware/adminMiddleware.js");
const workstation = require("../../src/modules/admin/fleet-workstation");

test("admin fleet-workstation Express route contract", () => {
  const expected = [
    ["get", "/fleet/:id/workstation", workstation.getFleetWorkstation],
    [
      "get",
      "/fleet/:fleetId/trips/:tripId/manifest",
      workstation.getTripManifest,
    ],
    [
      "patch",
      "/fleet/:fleetId/trips/:tripId/status",
      workstation.updateTripStatus,
    ],
    [
      "patch",
      "/fleet/:fleetId/trips/:tripId/driver",
      workstation.reassignTripDriver,
    ],
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
