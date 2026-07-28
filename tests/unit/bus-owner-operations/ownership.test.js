"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("bus-owner operations own the retired controller surface", () => {
  const root = path.resolve(__dirname, "../../..");
  const legacy = path.join(
    root, "controllers/busOwnerController/busOwnerController.js"
  );
  assert.equal(fs.existsSync(legacy), false);
  const baseline = fs.readFileSync(
    path.join(root, "config/refactor-file-size-baseline.json"), "utf8"
  );
  assert.doesNotMatch(
    baseline, /controllers\/busOwnerController\/busOwnerController\.js/
  );
  const router = fs.readFileSync(
    path.join(root, "routes/busOwner/busOwner.js"), "utf8"
  );
  assert.doesNotMatch(router, /busOwnerController\/busOwnerController/);
  for (const modulePath of [
    "src/modules/bus-owner/kyc-submission",
    "src/modules/bus-owner/fleet-management",
    "src/modules/bus-owner/boarding-point-management",
    "src/modules/bus-owner/amenity-management",
  ]) {
    assert.match(router, new RegExp(modulePath));
  }
  const exportsByModule = [
    ["kyc-submission", 2],
    ["fleet-management", 5],
    ["boarding-point-management", 5],
    ["amenity-management", 5],
  ];
  for (const [name, count] of exportsByModule) {
    const moduleExports = require(
      path.join(root, "src/modules/bus-owner", name)
    );
    assert.equal(Object.keys(moduleExports).length, count);
    assert.ok(Object.values(moduleExports).every(
      (value) => typeof value === "function"
    ));
  }
});
