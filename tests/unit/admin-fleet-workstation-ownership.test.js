"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const workstation = require("../../src/modules/admin/fleet-workstation");

const root = path.resolve(__dirname, "../..");

test("admin fleet-workstation owns the retired controller surface", () => {
  assert.equal(
    fs.existsSync(
      path.join(
        root,
        "controllers/adminController/fleetWorkstationController.js"
      )
    ),
    false
  );
  const routes = fs.readFileSync(
    path.join(root, "routes/adminRoutes/adminRoutes.js"),
    "utf8"
  );
  assert.match(routes, /src\/modules\/admin\/fleet-workstation/);
  assert.doesNotMatch(routes, /adminController\/fleetWorkstationController/);
  assert.deepEqual(Object.keys(workstation).sort(), [
    "getFleetWorkstation",
    "getTripManifest",
    "reassignTripDriver",
    "updateTripStatus",
  ]);
});

test("all fleet-workstation module files stay within 150 lines", () => {
  const directory = path.join(root, "src/modules/admin/fleet-workstation");
  const files = fs.readdirSync(directory).filter((file) => file.endsWith(".js"));
  for (const file of files) {
    const lines =
      fs.readFileSync(path.join(directory, file), "utf8").split("\n").length - 1;
    assert.ok(lines <= 150, `${file} exceeds 150 physical lines`);
  }
});

test("similarly named fleet and trip APIs remain separate", () => {
  const retained = [
    "src/modules/admin/fleet-management/index.js",
    "controllers/adminController/busOwnerController/fleetController.js",
    "src/modules/admin/trip-overview/index.js",
    "src/modules/admin/schedule-management/index.js",
    "controllers/conductorController/conductorController.js",
    "controllers/busOwnerController/busTripController.js",
  ];
  for (const file of retained) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} missing`);
  }
});
