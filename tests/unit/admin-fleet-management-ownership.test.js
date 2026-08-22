"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const moduleDir = path.join(root, "src/modules/admin/fleet-management");

test("fleet-management replaces and deletes the legacy controller", () => {
  assert.equal(
    fs.existsSync(
      path.join(
        root,
        "controllers/adminController/busOwnerController/" +
          "adminBusOwnerFleetController.js"
      )
    ),
    false
  );
  const routes = fs.readFileSync(
    path.join(root, "routes/adminRoutes/adminRoutes.js"),
    "utf8"
  );
  assert.match(routes, /src\/modules\/admin\/fleet-management/);
  assert.doesNotMatch(routes, /adminBusOwnerFleetController/);
  const baseline = fs.readFileSync(
    path.join(root, "config/refactor-file-size-baseline.json"),
    "utf8"
  );
  assert.doesNotMatch(baseline, /adminBusOwnerFleetController/);
});

test("fleet-management exposes the retained handlers and item review action", () => {
  const api = require("../../src/modules/admin/fleet-management");
  assert.deepEqual(Object.keys(api), [
    "getAllFleet",
    "getFleetById",
    "updateFleetStatus",
    "saveFleetReviewItem",
    "getFleetDashboard",
    "getFleetSetupStatus",
  ]);
});

test("module files comply with the 150-line boundary", () => {
  for (const file of fs.readdirSync(moduleDir)) {
    if (!file.endsWith(".js")) continue;
    const lines =
      fs.readFileSync(path.join(moduleDir, file), "utf8").split("\n").length - 1;
    assert.ok(lines <= 150, `${file} has ${lines} physical lines`);
  }
});

test("fleet-workstation remains a separate untouched production module", () => {
  const workstation = require("../../src/modules/admin/fleet-workstation");
  assert.deepEqual(Object.keys(workstation).sort(), [
    "getFleetWorkstation",
    "getTripManifest",
    "reassignTripDriver",
    "updateTripStatus",
  ]);
});
