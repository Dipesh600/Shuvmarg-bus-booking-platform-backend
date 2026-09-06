"use strict";
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const fixture = require("../helpers/security-cancellation-fixtures");
const Settlement = require("../../models/refundSettlementModel");
const Transaction = require("../../models/transactionModel");
const { updateRefund } = require("../../src/modules/admin/wallet-management/refund-settlement.service");
const { settleDispute } = require("../../src/modules/admin/wallet-management/dispute-settlement.service");
const { createBudgetedRefund } = require("../../src/shared/refund-budget");
const { withMongoTransaction } = require("../../src/shared/with-mongo-transaction");
const { Booking, Refund, Wallet, Ledger } = fixture;
let data; let refund; let author; let reviewer;
before(async () => { await fixture.start(); await Settlement.init(); await Transaction.init(); });
after(fixture.stop);
beforeEach(async () => {
  data = await fixture.seed(); await Settlement.deleteMany({}); await Transaction.deleteMany({});
  author = new mongoose.Types.ObjectId(); reviewer = new mongoose.Types.ObjectId();
  await Booking.updateOne({ _id: data.booking._id }, { $set: {
    paymentMethod: "SM_WALLET_SPLIT", smMoneyUsed: 200, gatewayAmount: 800, status: "cancelled" } });
  refund = await withMongoTransaction(mongoose, null, session => createBudgetedRefund({
    userId: data.userId, bookingId: data.booking._id, originalAmount: 1000, refundAmount: 800,
    cancellationCharge: 200, reason: "Cancellation", destination: "original",
    paymentAllocation: { smRefundAmount: 160, gatewayRefundAmount: 640 } }, session));
});
const update = (adminId, status, extra = {}) => updateRefund({ refundId: refund._id, adminId, status, refundGateway: "esewa", ...extra });
const submit = () => update(author, "processing", { proofKey: "disputes/refund/proof.webp", refundGatewayId: "REFUND-123" });

test("refund completion requires saved proof and a different finance reviewer", async () => {
  await assert.rejects(() => update(reviewer, "completed"), /proof/);
  await submit();
  await assert.rejects(() => update(author, "completed"), /different finance/);
  assert.equal((await Refund.findById(refund._id)).status, "processing");
  assert.equal(await Ledger.countDocuments({ type: "REFUND" }), 0);
});

test("concurrent completion records one external settlement and one SM refund leg", async () => {
  await submit();
  await Promise.allSettled(Array.from({ length: 20 }, () => update(reviewer, "completed")));
  assert.equal((await Refund.findById(refund._id)).status, "completed");
  assert.equal(await Settlement.countDocuments({}), 1);
  assert.equal(await Ledger.countDocuments({ type: "REFUND" }), 1);
  assert.equal((await Wallet.findOne({ userId: data.userId })).balance, 160);
  const replay = await update(reviewer, "completed");
  assert.equal(replay.changed, false);
});

test("failed SM refund leaves the external evidence and refund uncommitted", async t => {
  await submit();
  t.mock.method(fixture.walletService, "creditWallet", async () => { throw new Error("credit unavailable"); });
  await assert.rejects(() => update(reviewer, "completed"), /credit unavailable/);
  assert.equal(await Settlement.countDocuments({}), 0);
  assert.equal((await Refund.findById(refund._id)).status, "processing");
});

test("pending disputes remain open and require independent proof review to close", async () => {
  const transaction = await Transaction.create({ userId: data.userId, gateway: "esewa", transactionId: "payment-unique",
    totalAmount: 800, status: "DISPUTED", meta: { gatewayAmount: 800, smMoneyUsed: 0 } });
  const params = { transactionId: transaction._id, adminId: author, refundStatus: "PENDING", refundNote: "Receipt saved",
    refundReference: "DISPUTE-123", proofKey: "disputes/proof.webp" };
  await settleDispute(params);
  assert.equal((await Transaction.findById(transaction._id)).status, "DISPUTED");
  assert.equal((await Transaction.findById(transaction._id)).resolvedAt, null);
  await assert.rejects(() => settleDispute({ ...params, proofKey: null, refundStatus: "COMPLETED" }), /different finance/);
  await settleDispute({ ...params, proofKey: null, refundStatus: "COMPLETED", adminId: reviewer });
  assert.equal((await Transaction.findById(transaction._id)).status, "REFUNDED");
});

test("an external payout reference cannot settle both a refund and a dispute", async () => {
  await submit(); await update(reviewer, "completed");
  const transaction = await Transaction.create({ userId: data.userId, gateway: "esewa", transactionId: "other-payment",
    totalAmount: 640, status: "DISPUTED", meta: { gatewayAmount: 640 } });
  await settleDispute({ transactionId: transaction._id, adminId: author, refundStatus: "PENDING", refundNote: "Receipt",
    refundReference: "REFUND-123", proofKey: "another-proof.webp" });
  await assert.rejects(() => settleDispute({ transactionId: transaction._id, adminId: reviewer,
    refundStatus: "COMPLETED", refundNote: "Reviewed receipt" }), error => error.code === 11000);
  assert.equal((await Transaction.findById(transaction._id)).status, "DISPUTED");
});
