"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const routes = require("../../routes/adminRoutes/adminRoutes");
const adminMiddleware = require("../../middleware/adminMiddleware");
const userManagement = require("../../src/modules/admin/user-management");

test("admin user-management route and retirement contract", () => {
  const expected = [
    ["delete", "/deleteAccount", userManagement.deleteAccount],
    ["get", "/getAllUsers", userManagement.getAllUsers],
    ["post", "/getuserById", userManagement.getUserById],
    ["patch", "/resetPassword", userManagement.changeUserPassword],
    ["patch", "/updateStatus", userManagement.updateUserStatus],
    ["get", "/users/:id/transactions", userManagement.getUserTransactions],
  ];
  const routeLayers = routes.stack.filter((layer) => layer.route);
  for (const [method, routePath, handler] of expected) {
    const matches = routeLayers.filter(
      (layer) =>
        layer.route.path === routePath && layer.route.methods[method]
    );
    assert.equal(
      matches.length,
      1,
      `${method.toUpperCase()} ${routePath} must exist exactly once`
    );
    assert.deepEqual(
      matches[0].route.stack.map((layer) => layer.handle),
      [adminMiddleware, handler]
    );
  }
  assert.equal(Object.keys(userManagement).length, 6);
  assert.equal(
    fs.existsSync(
      path.resolve(
        __dirname,
        "../../controllers/adminController/adminController.js"
      )
    ),
    false
  );
});
