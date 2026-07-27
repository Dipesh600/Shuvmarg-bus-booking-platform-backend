"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const routes = require("../../routes/adminRoutes/adminRoutes.js");
const adminMiddleware = require("../../middleware/adminMiddleware.js");
const tripOverview = require("../../src/modules/admin/trip-overview");

test("admin trip-overview Express route contract", () => {
  const expected = [
    ["/trips/overview", tripOverview.getOverview],
    ["/trips/schedule-health", tripOverview.getScheduleHealth],
    ["/trips/search", tripOverview.searchTrips],
    ["/trips/route-performance", tripOverview.getRoutePerformance],
  ];
  const routeLayers = routes.stack.filter((layer) => layer.route);
  for (const [path, handler] of expected) {
    const matches = routeLayers.filter(
      (layer) => layer.route.path === path && layer.route.methods.get
    );
    assert.equal(matches.length, 1, `GET ${path} must exist exactly once`);
    assert.deepEqual(
      matches[0].route.stack.map((layer) => layer.handle),
      [adminMiddleware, handler]
    );
  }
});
