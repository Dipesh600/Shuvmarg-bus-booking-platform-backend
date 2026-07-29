"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const moduleDir = path.join(root, "src/modules/admin/wallet-management");

test("admin wallet module owns the retired controller", () => {
  assert.equal(fs.existsSync(path.join(
    root,
    "controllers/adminController/walletController/adminWalletController.js"
  )), false);
  const router = fs.readFileSync(
    path.join(root, "routes/adminRoutes/adminRoutes.js"), "utf8"
  );
  assert.match(router, /src\/modules\/admin\/wallet-management/);
  assert.doesNotMatch(router, /adminWalletController/);
});

test("admin wallet module exports only six route handlers", () => {
  const api = require("../../src/modules/admin/wallet-management");
  assert.deepEqual(Object.keys(api).sort(), [
    "adjustBalance", "freezeWallet", "getGlobalFeed",
    "getOverview", "getUserBalance", "lookupUser",
  ]);
});

test("admin wallet files remain within 150 lines", () => {
  for (const file of fs.readdirSync(moduleDir)) {
    if (!file.endsWith(".js")) continue;
    const count = fs.readFileSync(path.join(moduleDir, file), "utf8")
      .split("\n").length - 1;
    assert.ok(count <= 150, `${file} has ${count} lines`);
  }
});

test("shared financial engines remain outside admin ownership", () => {
  assert.equal(fs.existsSync(path.join(root, "services/walletService.js")), true);
  assert.equal(fs.existsSync(path.join(
    root, "src/modules/wallet/sm-ledger/index.js"
  )), true);
});
