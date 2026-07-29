"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const moduleDir = path.join(
  root, "src/modules/admin/operator-route-configuration"
);

test("operator route configuration owns the retired legacy subsystem", () => {
  for (const relative of [
    "services/operatorRouteConfigService.js",
    "controllers/adminController/operatorRouteConfigController.js",
  ]) {
    assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
  }
  const router = fs.readFileSync(
    path.join(root, "routes/adminRoutes/adminRoutes.js"), "utf8"
  );
  assert.match(router, /src\/modules\/admin\/operator-route-configuration/);
  assert.doesNotMatch(router, /operatorRouteConfigController/);
});

test("operator route configuration exports only its 11 route handlers", () => {
  const moduleApi = require(
    "../../src/modules/admin/operator-route-configuration"
  );
  assert.deepEqual(Object.keys(moduleApi).sort(), [
    "deleteConfig", "getAvailableVariants", "getBrandRouteServices",
    "getOperatorConfigs", "getReturnVariantStops",
    "getVariantStopsWithConfig", "listPatternsForVariant",
    "setDefaultPattern", "toggleConfigStatus", "updateConfig",
    "upsertOperatorConfig",
  ]);
});

test("all operator route-configuration files remain within 150 lines", () => {
  for (const file of fs.readdirSync(moduleDir)) {
    if (!file.endsWith(".js")) continue;
    const lines = fs.readFileSync(path.join(moduleDir, file), "utf8")
      .split("\n").length - 1;
    assert.ok(lines <= 150, `${file} has ${lines} lines`);
  }
});
