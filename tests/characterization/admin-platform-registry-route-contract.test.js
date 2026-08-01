"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const routes = require("../../routes/adminRoutes/adminRoutes.js");
const adminMiddleware = require("../../middleware/adminMiddleware.js");
const registry = require("../../src/modules/admin/platform-registry");
const boardingRoutes = require("../../routes/adminRoutes/registryBoardingRoutes.js");

test("admin platform-registry Express route contract", () => {
  const expected = [
    ["post", "/registry/stops/bulk-preview", registry.previewBulkImportStops],
    ["post", "/registry/stops/bulk-import", registry.bulkImportStops],
    ["post", "/registry/stops", registry.createStop],
    ["get", "/registry/stops", registry.getAllStops],
    ["get", "/registry/stops/search", registry.searchStops],
    ["patch", "/registry/stops/:id", registry.updateStop],
    ["delete", "/registry/stops/:id", registry.deleteStop],
    ["post", "/registry/corridors", registry.createCorridor],
    ["get", "/registry/corridors", registry.getAllCorridors],
    ["patch", "/registry/corridors/:id", registry.updateCorridor],
    ["delete", "/registry/corridors/:id", registry.deleteCorridor],
    ["post", "/registry/variants", registry.createVariant],
    ["get", "/registry/corridors/:corridorId/variants",
      registry.getVariantsByCorridor],
    ["patch", "/registry/variants/:id", registry.updateVariant],
    ["delete", "/registry/variants/:id", registry.deleteVariant],
    ["put", "/registry/variants/:variantId/stops", registry.setVariantStops],
    ["get", "/registry/variants/:variantId/stops",
      registry.getStopsForVariant],
  ];
  const layers = routes.stack.filter((layer) => layer.route);
  for (const [method, path, handler] of expected) {
    const matches = layers.filter(
      (layer) => layer.route.path === path && layer.route.methods[method]
    );
    assert.equal(matches.length, 1, `${method.toUpperCase()} ${path}`);
    assert.deepEqual(
      matches[0].route.stack.map((layer) => layer.handle),
      [adminMiddleware, handler]
    );
  }
  const nestedExpected = [
    ["post", "/boarding-points", registry.createBoardingPoint],
    ["get", "/boarding-points/:stopCode", registry.getBoardingPointsByStop],
    ["patch", "/boarding-points/:id", registry.updateBoardingPoint],
    ["delete", "/boarding-points/:id", registry.deleteRegistryBoardingPoint],
    ["post", "/boarding-locations", registry.createBoardingLocation],
    ["get", "/boarding-locations", registry.listBoardingLocations],
    ["get", "/boarding-locations/nearby", registry.getNearbyBoardingLocations],
    ["get", "/boarding-locations/:id", registry.getBoardingLocation],
    ["patch", "/boarding-locations/:id", registry.updateBoardingLocation],
    ["patch", "/boarding-locations/:id/deactivate", registry.deactivateBoardingLocation],
    ["get", "/operator-boarding-assignments", registry.listBoardingAssignmentReviews],
    ["patch", "/operator-boarding-assignments/:id/review", registry.reviewBoardingAssignment],
  ];
  assert.equal(boardingRoutes.stack[0].handle, adminMiddleware);
  for (const [method, path, handler] of nestedExpected) {
    const matches = boardingRoutes.stack.filter(
      (layer) => layer.route?.path === path && layer.route.methods[method]
    );
    assert.equal(matches.length, 1, `${method.toUpperCase()} /registry${path}`);
    assert.deepEqual(matches[0].route.stack.map((layer) => layer.handle), [handler]);
  }
});
