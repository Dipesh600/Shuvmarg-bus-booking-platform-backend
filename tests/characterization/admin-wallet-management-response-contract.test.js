"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const adjustments = require(
  "../../src/modules/admin/wallet-management/wallet-adjustment.service.js"
);
const statusChanges = require(
  "../../src/modules/admin/wallet-management/wallet-status.service.js"
);
const users = require(
  "../../src/modules/admin/wallet-management/wallet-user-query.service.js"
);
const wallet = require("../../src/modules/admin/wallet-management");

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

function response() {
  return {
    code: 200,
    body: null,
    status(value) { this.code = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

test("adjustment maps known financial errors without changing the API",
  async (t) => {
    patch(t, adjustments, "adjustWallet", async () => {
      throw new Error("Insufficient wallet balance");
    });
    const res = response();
    await wallet.adjustBalance({
      adminInfo: { id: "admin" },
      body: {
        userId: "u1", type: "debit", amount: 10,
        purpose: "reversal", remarks: "valid audit remarks",
      },
    }, res);
    assert.equal(res.code, 400);
    assert.deepEqual(res.body, {
      status: false, message: "Insufficient wallet balance",
    });
  });

test("adjustment preserves missing-user response", async (t) => {
  patch(t, adjustments, "adjustWallet", async () => null);
  const res = response();
  await wallet.adjustBalance({
    adminInfo: { id: "admin" },
    body: {
      userId: "missing", type: "credit", amount: 10,
      purpose: "bonus", remarks: "valid audit remarks",
    },
  }, res);
  assert.equal(res.code, 404);
  assert.deepEqual(res.body, { status: false, message: "User not found" });
});

test("freeze preserves already-state response", async (t) => {
  patch(t, statusChanges, "changeWalletStatus", async () => ({
    already: "frozen",
  }));
  const res = response();
  await wallet.freezeWallet({
    body: {
      userId: "u1", action: "freeze", remarks: "valid audit remarks",
    },
  }, res);
  assert.equal(res.code, 400);
  assert.deepEqual(res.body, {
    status: false, message: "Wallet is already frozen",
  });
});

test("balance endpoint validates IDs before storage access", async (t) => {
  let called = false;
  patch(t, users, "getUserBalance", async () => { called = true; });
  const res = response();
  await wallet.getUserBalance({ params: { userId: "invalid" } }, res);
  assert.equal(res.code, 400);
  assert.deepEqual(res.body, {
    status: false, message: "Valid userId is required",
  });
  assert.equal(called, false);
});

test("lookup preserves short-query rejection", async (t) => {
  let called = false;
  patch(t, users, "lookupUserWallet", async () => { called = true; });
  const res = response();
  await wallet.lookupUser({ query: { query: "x" } }, res);
  assert.equal(res.code, 400);
  assert.deepEqual(res.body, {
    status: false, message: "Search query must be at least 2 characters",
  });
  assert.equal(called, false);
});
