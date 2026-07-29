"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const moduleDir = path.join(root, "../src/modules/admin/platform-registry");

test("platform registry module owns the retired legacy subsystem", () => {
  for (const relative of [
    "services/platformRegistryService.js",
    "controllers/adminController/platformRegistryController.js",
  ]) {
    assert.equal(fs.existsSync(path.join(root, "..", relative)), false, relative);
  }
  const router = fs.readFileSync(
    path.join(root, "../routes/adminRoutes/adminRoutes.js"),
    "utf8"
  );
  assert.match(router, /src\/modules\/admin\/platform-registry/);
  assert.doesNotMatch(router, /platformRegistryController/);

  const source = fs.readdirSync(moduleDir)
    .filter((file) => file.endsWith(".js"))
    .map((file) => fs.readFileSync(path.join(moduleDir, file), "utf8"))
    .join("\n");
  assert.doesNotMatch(source, /admin\/route-discovery/);
  assert.doesNotMatch(source, /bus-owner\/boarding/);
});

test("platform registry exports only the 21 route handlers", () => {
  const registry = require("../../src/modules/admin/platform-registry");
  assert.deepEqual(Object.keys(registry).sort(), [
    "bulkImportStops", "createBoardingPoint", "createCorridor", "createStop",
    "createVariant", "deleteCorridor", "deleteRegistryBoardingPoint",
    "deleteStop", "deleteVariant", "getAllCorridors", "getAllStops",
    "getBoardingPointsByStop", "getStopsForVariant", "getVariantsByCorridor",
    "previewBulkImportStops", "searchStops", "setVariantStops",
    "updateBoardingPoint", "updateCorridor", "updateStop", "updateVariant",
  ]);
});

test("every platform registry production file stays within 150 lines", () => {
  for (const file of fs.readdirSync(moduleDir).filter((item) =>
    item.endsWith(".js")
  )) {
    const lines = fs.readFileSync(path.join(moduleDir, file), "utf8")
      .split("\n").length - 1;
    assert.ok(lines <= 150, `${file} has ${lines} physical lines`);
  }
});
