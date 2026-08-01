"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const routes = require("../../routes/adminRoutes/adminRoutes.js");
const adminMiddleware = require("../../middleware/adminMiddleware.js");
const registry = require("../../src/modules/admin/platform-registry");

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
    ["post", "/registry/boarding-points", registry.createBoardingPoint],
    ["get", "/registry/boarding-points/:stopCode",
      registry.getBoardingPointsByStop],
    ["patch", "/registry/boarding-points/:id", registry.updateBoardingPoint],
    ["delete", "/registry/boarding-points/:id",
      registry.deleteRegistryBoardingPoint],
    ["post", "/registry/boarding-locations",
      registry.createBoardingLocation],
    ["get", "/registry/boarding-locations",
      registry.listBoardingLocations],
    ["get", "/registry/boarding-locations/nearby",
      registry.getNearbyBoardingLocations],
    ["get", "/registry/boarding-locations/:id",
      registry.getBoardingLocation],
    ["patch", "/registry/boarding-locations/:id",
      registry.updateBoardingLocation],
    ["patch", "/registry/boarding-locations/:id/deactivate",
      registry.deactivateBoardingLocation],
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
});
