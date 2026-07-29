"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const moduleDirectory = path.join(
  root,
  "src/modules/admin/financial-overview"
);

test("financial overview module owns the retired controller route", () => {
  assert.equal(
    fs.existsSync(path.join(
      root,
      "controllers/adminController/financialController/" +
      "financialController.js"
    )),
    false
  );
  const routes = fs.readFileSync(
    path.join(root, "routes/adminRoutes/adminRoutes.js"),
    "utf8"
  );
  assert.match(routes, /src\/modules\/admin\/financial-overview/);
  assert.doesNotMatch(
    routes,
    /adminController\/financialController\/financialController/
  );
});

test("production index exports only the financial overview handler", () => {
  const api = require("../../src/modules/admin/financial-overview");
  assert.deepEqual(Object.keys(api), ["getFinancialOverview"]);
  assert.equal(typeof api.getFinancialOverview, "function");
});

test("financial overview module files remain within 150 lines", () => {
  const files = fs.readdirSync(moduleDirectory)
    .filter((file) => file.endsWith(".js"));
  for (const file of files) {
    const lines = fs.readFileSync(
      path.join(moduleDirectory, file),
      "utf8"
    ).split("\n").length - 1;
    assert.ok(lines <= 150, `${file} has ${lines} lines`);
  }
});

test("retired controller is removed from the size baseline", () => {
  const baseline = fs.readFileSync(
    path.join(root, "config/refactor-file-size-baseline.json"),
    "utf8"
  );
  assert.doesNotMatch(baseline, /financialController\.js/);
});
