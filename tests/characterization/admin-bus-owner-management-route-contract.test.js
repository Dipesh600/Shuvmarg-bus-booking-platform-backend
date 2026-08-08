"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const routes = require("../../routes/adminRoutes/adminRoutes.js");
const adminMiddleware = require("../../middleware/adminMiddleware.js");
const busOwners = require("../../src/modules/admin/bus-owner-management");

test("admin bus-owner management Express route contract", () => {
  const expected = [
    ["post", "/busOwner/create", busOwners.createBusOwnerFull],
    [
      "post",
      "/busOwner/reuploadKycDocument",
      busOwners.reuploadKycDocument,
    ],
    ["get", "/getAllBusOwners", busOwners.getAllBusOwners],
    ["post", "/getBusOwnerDetails", busOwners.getBusOwnerById],
    ["get", "/getAllBusOwnerKycs", busOwners.getAllBusOwnerKycs],
    ["post", "/getBusOwnerKycDetails", busOwners.getBusOwnerKycById],
    ["patch", "/busOwnerKycStatus", busOwners.updateBusOwnerKyc],
    ["patch", "/busOwner/update", busOwners.updateBusOwnerProfile],
    ["get", "/busOwnerDashboard", busOwners.getBusOwnerDashboard],
  ];
  const routeLayers = routes.stack.filter((layer) => layer.route);
  for (const [method, path, handler] of expected) {
    const matches = routeLayers.filter(
      (layer) => layer.route.path === path && layer.route.methods[method]
    );
    assert.equal(
      matches.length,
      1,
      `${method.toUpperCase()} ${path} must exist exactly once`
    );
    const expectedStack = (path === "/getBusOwnerDetails" || path === "/getBusOwnerKycDetails")
      ? [adminMiddleware, matches[0].route.stack[1].handle, handler]
      : [adminMiddleware, handler];
    assert.deepEqual(
      matches[0].route.stack.map((layer) => layer.handle),
      expectedStack
    );
  }
});
