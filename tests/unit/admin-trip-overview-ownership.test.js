"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");

test("admin trip-overview module owns the retired controller", () => {
  assert.equal(
    fs.existsSync(
      path.join(root, "controllers/adminController/tripOverviewController.js")
    ),
    false
  );
  const routes = fs.readFileSync(
    path.join(root, "routes/adminRoutes/adminRoutes.js"),
    "utf8"
  );
  assert.match(routes, /src\/modules\/admin\/trip-overview/);
  assert.doesNotMatch(routes, /adminController\/tripOverviewController/);
  const directory = path.join(root, "src/modules/admin/trip-overview");
  const files = fs.readdirSync(directory).filter((file) => file.endsWith(".js"));
  assert.ok(files.length >= 10);
  for (const file of files) {
    const lines =
      fs.readFileSync(path.join(directory, file), "utf8").split("\n").length - 1;
    assert.ok(lines <= 150, `${file} exceeds 150 physical lines`);
  }
});
