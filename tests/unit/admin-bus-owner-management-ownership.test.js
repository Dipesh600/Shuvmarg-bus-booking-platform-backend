"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const busOwners = require("../../src/modules/admin/bus-owner-management");

const root = path.resolve(__dirname, "../..");
const expectedExports = [
  "createBusOwnerFull",
  "getAllBusOwnerKycs",
  "getAllBusOwners",
  "getBusOwnerById",
  "getBusOwnerDashboard",
  "getBusOwnerKycById",
  "reuploadKycDocument",
  "updateBusOwnerKyc",
  "updateBusOwnerProfile",
];

test("admin bus-owner module owns the retired controller surface", () => {
  assert.equal(
    fs.existsSync(
      path.join(
        root,
        "controllers/adminController/busOwnerController/adminBusOwnerController.js"
      )
    ),
    false
  );
  const routeSource = fs.readFileSync(
    path.join(root, "routes/adminRoutes/adminRoutes.js"),
    "utf8"
  );
  assert.match(routeSource, /src\/modules\/admin\/bus-owner-management/);
  assert.doesNotMatch(routeSource, /adminBusOwnerController/);
  assert.deepEqual(Object.keys(busOwners).sort(), expectedExports);
});

test("module files obey the 150-line boundary", () => {
  const directory = path.join(
    root,
    "src/modules/admin/bus-owner-management"
  );
  const files = fs.readdirSync(directory).filter((file) => file.endsWith(".js"));
  for (const file of files) {
    const lines =
      fs.readFileSync(path.join(directory, file), "utf8").split("\n").length - 1;
    assert.ok(lines <= 150, `${file} exceeds 150 physical lines`);
  }
});

test("separate bus-owner responsibilities remain in domain modules", () => {
  const retained = [
    "controllers/adminController/busOwnerController/adminBusOwnerFleetController.js",
    "src/modules/bus-owner/schedule-management/index.js",
    "src/modules/bus-owner/kyc-submission/index.js",
    "src/modules/bus-owner/fleet-management/index.js",
    "src/modules/bus-owner/boarding-point-management/index.js",
    "src/modules/bus-owner/amenity-management/index.js",
  ];
  for (const file of retained) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} missing`);
  }
});
