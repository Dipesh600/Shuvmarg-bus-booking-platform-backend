"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const moduleDir = path.join(root, "../src/modules/admin/platform-registry");
const domainDir = path.join(root, "../src/domain/stop");
const boardingDomainDir = path.join(root, "../src/domain/boarding-location");
const modelPath = path.join(root, "../models/stopModel.js");
const boardingModelPath = path.join(root, "../models/boardingLocationModel.js");

/**
 * Recursively collect all .js files under a directory.
 */
function collectJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
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

test("platform registry exports only its declared route handlers", () => {
  const registry = require("../../src/modules/admin/platform-registry");
  assert.deepEqual(Object.keys(registry).sort(), [
    "activateVariantDraft", "addExistingVariantDraftStop", "bulkImportStops", "commitVariantDraft",
    "createBoardingLocation", "createBoardingPoint",
    "createCorridor", "createStop", "createVariant",
    "createVariantDraft", "createVariantRevision",
    "deactivateBoardingLocation", "deleteCorridor", "deleteRegistryBoardingPoint",
    "deleteStop", "deleteVariant", "enableBoardingLocationOperatorAccess",
    "getAllCorridors", "getAllStops",
    "getBoardingLocation", "getBoardingPointsByStop",
    "getNearbyBoardingLocations", "getStopsForVariant", "getVariantDetails", "getVariantDraft", "getVariantsByCorridor",
    "listBoardingAssignmentReviews", "listBoardingLocationOperatorAccess", "listBoardingLocations",
    "prepareVariantDraftStopCandidates", "previewBulkImportStops", "refreshVariantDraftRouteOptions",
    "reviewBoardingAssignment", "searchStops", "searchVariantDraftGuidancePlaces",
    "selectVariantDraftRouteOption", "setVariantStops",
    "updateBoardingLocation", "updateBoardingPoint", "updateCorridor",
    "updateStop", "updateVariant", "updateVariantDraftCandidate", "updateVariantDraftDetails",
    "useAllMatchedVariantDraftCandidates",
  ]);
});

test("no migration source code calls syncIndexes() or createIndexes()", () => {
  const migFiles = collectJsFiles(path.join(moduleDir, "stop-registry-migration"));
  const allMigSource = migFiles
    .map((f) => fs.readFileSync(f, "utf8"))
    .join("\n");
  const callSyncIndexes = /\.syncIndexes\s*\(/;
  const callCreateIndexes = /\.createIndexes\s*\(/;
  assert.ok(!callSyncIndexes.test(allMigSource), "Migration code must not call .syncIndexes()");
  assert.ok(!callCreateIndexes.test(allMigSource), "Migration code must not call .createIndexes()");
});

test("every platform registry, stop model, and domain production file stays within 150 lines", () => {
  const targets = [
    ...collectJsFiles(moduleDir),
    ...collectJsFiles(domainDir),
    ...collectJsFiles(boardingDomainDir),
    modelPath,
    boardingModelPath,
  ];

  for (const fullPath of targets) {
    const rel = path.relative(root, fullPath);
    const lines = fs.readFileSync(fullPath, "utf8").split("\n").length - 1;
    assert.ok(
      lines <= 150,
      `${rel} has ${lines} physical lines; production limit is 150`
    );
  }
});
