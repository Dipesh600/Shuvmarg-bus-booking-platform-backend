"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const routes = require("../../routes/adminRoutes/adminRoutes.js");
const adminMiddleware = require("../../middleware/adminMiddleware.js");
const financialOverview = require(
  "../../src/modules/admin/financial-overview"
);

test("financial overview route preserves method, path, and handlers", () => {
  const matches = routes.stack.filter(
    (layer) =>
      layer.route?.path === "/financial/overview" &&
      layer.route.methods.get
  );
  assert.equal(matches.length, 1);
  assert.deepEqual(
    matches[0].route.stack.map((layer) => layer.handle),
    [adminMiddleware, financialOverview.getFinancialOverview]
  );
});
