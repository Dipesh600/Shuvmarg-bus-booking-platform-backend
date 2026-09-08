"use strict";
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const fixture = require("../helpers/security-cancellation-fixtures");
const { createBudgetedRefund } = require("../../src/shared/refund-budget");
const { withMongoTransaction } = require("../../src/shared/with-mongo-transaction");
const { updateRefund } = require("../../src/modules/admin/wallet-management/refund-settlement.service");
const { Booking, Refund } = fixture;
let data;
before(fixture.start); after(fixture.stop);
beforeEach(async () => {
  data = await fixture.seed();
  await Booking.updateOne({ _id: data.booking._id }, { $set: { totalAmount: 0.03, originalAmount: 0.03,
    smMoneyUsed: 0.01, gatewayAmount: 0.02, paymentMethod: "SM_WALLET_SPLIT" } });
});
const reserve = (id, amount = 0.01) => withMongoTransaction(mongoose, null, session => createBudgetedRefund({
  userId: data.userId, bookingId: data.booking._id, originalAmount: 0.03,
  refundAmount: amount, operationKey: id, reason: "Partial cancellation", destination: "original" }, session));

test("paisa-sized partial refunds conserve both original payment sources", async () => {
  const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => reserve(`part-${i}`)));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 3);
  const rows = await Refund.find({});
  assert.equal(Math.round(rows.reduce((n, r) => n + r.paymentAllocation.smRefundAmount, 0) * 100), 1);
  assert.equal(Math.round(rows.reduce((n, r) => n + r.paymentAllocation.gatewayRefundAmount, 0) * 100), 2);
});
test("rejection releases its budget atomically and permits a new reviewed request", async () => {
  const refund = await reserve('original-request', 0.03);
  await updateRefund({ refundId: refund._id, adminId: new mongoose.Types.ObjectId(),
    status: "rejected", remarks: "Incorrect cancellation request" });
  assert.equal((await Booking.findById(data.booking._id)).refundReservedMinor, 0);
  await reserve('replacement-request', 0.03);
  assert.equal((await Booking.findById(data.booking._id)).refundReservedMinor, 3);
});
test("payout evidence prevents rejecting and releasing money that may already be paid", async () => {
  const refund = await reserve('paid-request', 0.03);
  await Refund.updateOne({ _id: refund._id }, { $set: { refundProof: 'proof/receipt.webp' } });
  await assert.rejects(() => updateRefund({ refundId: refund._id, adminId: new mongoose.Types.ObjectId(),
    status: "rejected", remarks: "Incorrect cancellation request" }), /payout evidence/);
  assert.equal((await Booking.findById(data.booking._id)).refundReservedMinor, 3);
});
test("corrupt source allocation cannot be completed or used to authorize another refund", async () => {
  const refund = await reserve('corrupt-request', 0.02);
  await Refund.updateOne({ _id: refund._id }, { $set: { paymentAllocation: {
    allocationKnown: true, smRefundAmount: 0.02, gatewayRefundAmount: 0 } } });
  await assert.rejects(() => reserve('another-request'), /original payment source/);
  await assert.rejects(() => updateRefund({ refundId: refund._id, adminId: new mongoose.Types.ObjectId(), status: 'completed' }), /original payment source/);
});

test("stale refund counters cannot authorize further refunds", async () => {
  await reserve('first-request', 0.02);
  await Booking.updateOne({ _id: data.booking._id }, { $set: { refundReservedMinor: 0 } });
  await assert.rejects(() => reserve('next-request'), /reservation history/);
  assert.equal(await Refund.countDocuments({}), 1);
});
