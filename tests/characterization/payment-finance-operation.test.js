"use strict";
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { mongoose, SMLedger } = require("../helpers/payment-reversal-harness");
const Wallet = require("../../models/walletModel");
const Operation = require("../../models/financialOperationModel");
const wallet = require("../../services/walletService");
const operations = require("../../src/shared/financial-operation");
beforeEach(async () => { await Operation.init(); await Operation.deleteMany({}); await Wallet.deleteMany({}); });

const input = (userId, overrides = {}) => ({ scope: "test-credit", operationId: "finance_operation_1234",
  actorId: "finance-admin", payload: { userId: String(userId), amount: 25 },
  work: async session => {
    const { ledgerEntry } = await wallet.creditWallet({ userId, amount: 25, purpose: "admin_adjustment", session });
    return { ledgerEntryId: String(ledgerEntry._id) };
  }, ...overrides });

test("twenty concurrent adjustments credit once and preserve actor and amount evidence", async () => {
  const userId = new mongoose.Types.ObjectId();
  await Wallet.create({ userId });
  const results = await Promise.all(Array.from({ length: 20 }, () => operations.runOperation(input(userId))));
  assert.equal(new Set(results.map(r => r.ledgerEntryId)).size, 1);
  assert.equal(await wallet.getBalance(userId), 25);
  assert.equal(await Operation.countDocuments({}), 1);
  const record = await Operation.findOne();
  assert.equal(record.actorId, "finance-admin");
  assert.equal(record.payload.amount, 25);
});

test("reusing an operation for a different amount or administrator is rejected", async () => {
  const userId = new mongoose.Types.ObjectId();
  await operations.runOperation(input(userId));
  for (const overrides of [{ payload: { userId: String(userId), amount: 26 } }, { actorId: "other-admin" }]) {
    await assert.rejects(() => operations.runOperation(input(userId, overrides)), /different money change/);
  }
  assert.equal(await wallet.getBalance(userId), 25);
});

test("operation and credit roll back together if recording the final result fails", async () => {
  const userId = new mongoose.Types.ObjectId();
  const normal = input(userId);
  await assert.rejects(() => operations.runOperation({ ...normal, work: async session => {
    await normal.work(session); throw new Error("interrupted operation");
  } }), /interrupted operation/);
  assert.equal(await Operation.countDocuments({}), 0);
  assert.equal(await SMLedger.countDocuments({}), 0);
  await operations.runOperation(normal);
  assert.equal(await wallet.getBalance(userId), 25);
});

test("missing operation IDs cannot perform a money change", async () => {
  let called = false;
  await assert.rejects(() => operations.runOperation(input(new mongoose.Types.ObjectId(), {
    operationId: null, work: async () => { called = true; },
  })), /operationId is required/);
  assert.equal(called, false);
});
