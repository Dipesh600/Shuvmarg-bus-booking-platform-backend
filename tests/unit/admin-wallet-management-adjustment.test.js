"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const operations = require("../../src/shared/financial-operation");
const User = require("../../models/userModel.js");
const walletService = require("../../services/walletService.js");
const service = require(
  "../../src/modules/admin/wallet-management/wallet-adjustment.service.js"
);

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

function userQuery(value) {
  return { select() { return this; }, async lean() { return value; } };
}

test("credit adjustment preserves audited financial input", async (t) => {
  patch(t, operations, "runOperation", async ({ work }) => work(null));
  let input;
  patch(t, User, "findById", () => userQuery({
    name: "Passenger", phone: "9800000000",
  }));
  patch(t, walletService, "creditWallet", async (value) => {
    input = value;
    return { ledgerEntry: { _id: "credit-entry" } };
  });
  const result = await service.adjustWallet("admin-1", {
    userId: "user-1", type: "credit", amount: "25.50",
    purpose: "bonus", remarks: " manual correction ",
  });
  assert.deepEqual(input, {
    userId: "user-1",
    amount: 25.5,
    purpose: "bonus",
    referenceType: "admin",
    referenceId: "admin-1",
    remarks: "[ADMIN: admin-1] manual correction",
    session: null,
  });
  assert.equal(
    result.message,
    "Successfully credited Rs. 25.5 to Passenger's Shuvmarg Money"
  );
  assert.equal(result.data.ledgerEntry._id, "credit-entry");
});

test("debit adjustment uses the debit engine", async (t) => {
  patch(t, operations, "runOperation", async ({ work }) => work(null));
  let debitCalls = 0;
  let creditCalls = 0;
  patch(t, User, "findById", () => userQuery({
    name: "Passenger", phone: "9800000000",
  }));
  patch(t, walletService, "debitWallet", async () => {
    debitCalls += 1;
    return { ledgerEntry: { _id: "debit-entry" } };
  });
  patch(t, walletService, "creditWallet", async () => { creditCalls += 1; });
  const result = await service.adjustWallet("admin-1", {
    userId: "user-1", type: "debit", amount: 10,
    purpose: "reversal", remarks: "reverse incorrect credit",
  });
  assert.equal(debitCalls, 1);
  assert.equal(creditCalls, 0);
  assert.match(result.message, /debited Rs. 10 from Passenger/);
});

test("adjustment returns null before financial mutation for missing user",
  async (t) => {
    let mutation = false;
    patch(t, User, "findById", () => userQuery(null));
    patch(t, walletService, "creditWallet", async () => { mutation = true; });
    assert.equal(await service.adjustWallet("admin-1", {
      userId: "missing", type: "credit", amount: 10,
      purpose: "bonus", remarks: "valid audit remarks",
    }), null);
    assert.equal(mutation, false);
  });
