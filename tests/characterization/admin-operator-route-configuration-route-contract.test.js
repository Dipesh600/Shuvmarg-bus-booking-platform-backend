"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const routes = require("../../routes/adminRoutes/adminRoutes.js");
const adminMiddleware = require("../../middleware/adminMiddleware.js");
const configuration = require(
  "../../src/modules/admin/operator-route-configuration"
);

test("admin operator route-configuration Express contract", () => {
  const expected = [
    ["get", "/operator-config/variants",
      configuration.getAvailableVariants],
    ["get", "/operator-config/:brandId",
      configuration.getOperatorConfigs],
    ["get", "/operator-config/:brandId/variant/:variantId/stops",
      configuration.getVariantStopsWithConfig],
    ["get", "/operator-config/:brandId/variant/:variantId/return-stops",
      configuration.getReturnVariantStops],
    ["get", "/operator-config/:brandId/variant/:variantId/patterns",
      configuration.listPatternsForVariant],
    ["post", "/operator-config", configuration.upsertOperatorConfig],
    ["patch", "/operator-config/:configId", configuration.updateConfig],
    ["patch", "/operator-config/:configId/status",
      configuration.toggleConfigStatus],
    ["patch", "/operator-config/:configId/set-default",
      configuration.setDefaultPattern],
    ["delete", "/operator-config/:configId", configuration.deleteConfig],
    ["get", "/brands/:brandId/route-services",
      configuration.getBrandRouteServices],
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
