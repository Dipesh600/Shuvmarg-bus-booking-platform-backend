"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const moduleDir = path.join(root, "../src/modules/admin/platform-registry");

/**
 * Recursively collect all .js files under a directory.
 */
function collectJsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

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

  // Scan top-level files only for prohibited imports
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

test("every platform registry production file stays within 400 lines", () => {
  // Scan all .js files recursively — including stop-registry-migration/ subdirectory
  for (const fullPath of collectJsFiles(moduleDir)) {
    const rel = path.relative(moduleDir, fullPath);
    const lines = fs.readFileSync(fullPath, "utf8").split("\n").length - 1;
    assert.ok(lines <= 400, `${rel} has ${lines} physical lines`);
  }
});
