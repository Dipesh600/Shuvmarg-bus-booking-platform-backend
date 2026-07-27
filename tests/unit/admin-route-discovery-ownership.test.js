"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");

test("route discovery module owns the retired legacy subsystem", () => {
  const legacy = [
    "services/routeDiscoveryService.js",
    "controllers/adminController/routeDiscoveryController.js",
  ];
  for (const relative of legacy) {
    assert.equal(fs.existsSync(path.join(root, relative)), false, relative);
  }
  const routes = fs.readFileSync(
    path.join(root, "routes/adminRoutes/adminRoutes.js"),
    "utf8"
  );
  assert.match(routes, /src\/modules\/admin\/route-discovery/);
  assert.doesNotMatch(routes, /routeDiscoveryController/);
  const directory = path.join(root, "src/modules/admin/route-discovery");
  const files = fs.readdirSync(directory).filter((file) => file.endsWith(".js"));
  assert.ok(files.length >= 10);
  for (const file of files) {
    const physicalLines = fs
      .readFileSync(path.join(directory, file), "utf8")
      .split("\n").length - 1;
    assert.ok(physicalLines <= 150, `${file} exceeds 150 physical lines`);
  }
});
