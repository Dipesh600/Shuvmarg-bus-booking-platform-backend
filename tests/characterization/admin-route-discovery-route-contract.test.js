"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const adminRoutes = require("../../routes/adminRoutes/adminRoutes.js");
const adminMiddleware = require("../../middleware/adminMiddleware.js");
const discovery = require("../../src/modules/admin/route-discovery");

test("admin route-discovery Express contract", () => {
  const expected = [
    ["post", "/registry/discovery", discovery.createSession],
    ["get", "/registry/discovery", discovery.listSessions],
    ["get", "/registry/discovery/:id", discovery.getSession],
    ["patch", "/registry/discovery/:id/select-route", discovery.selectRoute],
    ["patch", "/registry/discovery/:id/stops/:stopId", discovery.patchStop],
    ["patch", "/registry/discovery/:id/approve", discovery.approveSession],
    ["patch", "/registry/discovery/:id/reject", discovery.rejectSession],
    ["post", "/registry/discovery/:id/publish", discovery.publishSession],
    ["patch", "/registry/discovery/:id/route-options", discovery.setRouteOptions],
    [
      "patch",
      "/registry/discovery/:id/discovered-stops",
      discovery.setDiscoveredStops,
    ],
    [
      "patch",
      "/registry/discovery/:id/refine-stops",
      discovery.refineStopsWithLLM,
    ],
  ];
  const routeLayers = adminRoutes.stack.filter((layer) => layer.route);
  for (const [method, path, handler] of expected) {
    const matches = routeLayers.filter(
      (layer) => layer.route.path === path && layer.route.methods[method]
    );
    assert.equal(matches.length, 1, `${method.toUpperCase()} ${path} once`);
    const handlers = matches[0].route.stack.map((layer) => layer.handle);
    assert.deepEqual(handlers, [adminMiddleware, handler]);
  }
});
