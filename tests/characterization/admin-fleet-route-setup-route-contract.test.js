"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const routes = require("../../routes/adminRoutes/adminRoutes.js");
const adminMiddleware = require("../../middleware/adminMiddleware.js");
const fleet = require("../../controllers/adminController/busOwnerController/fleetController.js");

test("admin fleet registration saves the shared route setup contract", () => {
  const matches = routes.stack.filter((layer) =>
    layer.route?.path === "/fleet/:fleetId/route-setup"
    && layer.route.methods.put
  );
  assert.equal(matches.length, 1);
  assert.deepEqual(
    matches[0].route.stack.map((layer) => layer.handle),
    [adminMiddleware, fleet.saveFleetRouteSetup]
  );
});
