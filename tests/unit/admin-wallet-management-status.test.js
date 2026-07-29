"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../../models/userModel.js");
const walletService = require("../../services/walletService.js");
const service = require(
  "../../src/modules/admin/wallet-management/wallet-status.service.js"
);

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

function userQuery(value) {
  return { select() { return this; }, async lean() { return value; } };
}

test("wallet status change stops when the user is missing", async (t) => {
  let walletRead = false;
  patch(t, User, "findById", () => userQuery(null));
  patch(t, walletService, "getOrCreateWallet", async () => {
    walletRead = true;
  });
  assert.deepEqual(
    await service.changeWalletStatus("missing", "freeze"),
    { notFound: true }
  );
  assert.equal(walletRead, false);
});

test("wallet status change preserves already-state behavior", async (t) => {
  patch(t, User, "findById", () => userQuery({
    name: "Passenger", phone: "9800000000",
  }));
  patch(t, walletService, "getOrCreateWallet", async () => ({
    status: "frozen",
  }));
  assert.deepEqual(
    await service.changeWalletStatus("u1", "freeze"),
    { already: "frozen" }
  );
});

test("wallet freeze persists and returns the previous state", async (t) => {
  let saved = false;
  const wallet = {
    status: "active", balance: 50,
    async save() { saved = true; },
  };
  patch(t, User, "findById", () => userQuery({
    name: "Passenger", phone: "9800000000",
  }));
  patch(t, walletService, "getOrCreateWallet", async () => wallet);
  const result = await service.changeWalletStatus("u1", "freeze");
  assert.equal(saved, true);
  assert.equal(wallet.status, "frozen");
  assert.equal(result.message, "Passenger's wallet has been freezed");
  assert.deepEqual(result.data, {
    walletStatus: "frozen", previousStatus: "active", balance: 50,
    user: { name: "Passenger", phone: "9800000000" },
  });
});
