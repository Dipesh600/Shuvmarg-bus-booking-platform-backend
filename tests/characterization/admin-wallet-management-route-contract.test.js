"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const routes = require("../../routes/adminRoutes/adminRoutes.js");
const adminMiddleware = require("../../middleware/adminMiddleware.js");
const wallet = require("../../src/modules/admin/wallet-management");

test("admin wallet-management Express route contract", () => {
  const expected = [
    ["get", "/wallet/overview", wallet.getOverview],
    ["get", "/wallet/global-feed", wallet.getGlobalFeed],
    ["get", "/wallet/lookup", wallet.lookupUser],
    ["post", "/wallet/adjust", wallet.adjustBalance],
    ["patch", "/wallet/freeze", wallet.freezeWallet],
    ["get", "/wallet/user-balance/:userId", wallet.getUserBalance],
  ];
  const layers = routes.stack.filter((layer) => layer.route);
  for (const [method, path, handler] of expected) {
    const matches = layers.filter(
      (layer) => layer.route.path === path && layer.route.methods[method]
    );
    assert.equal(matches.length, 1, `${method.toUpperCase()} ${path}`);
    assert.deepEqual(
      matches[0].route.stack.map((layer) => layer.handle),
      [adminMiddleware, ...(["post", "patch"].includes(method) ? [require("../../middleware/requireFinanceAdmin")] : []), handler]
    );
  }
});
