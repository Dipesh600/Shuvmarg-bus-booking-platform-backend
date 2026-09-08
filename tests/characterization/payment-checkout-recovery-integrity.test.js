"use strict";
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const fixture = require("../helpers/security-cancellation-fixtures");
const Attempt = require("../../models/esewaPaymentAttemptModel");
const Transaction = require("../../models/transactionModel");
const Trip = require("../../models/tripModel");
const { createReservedAttempt } = require("../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout-reservation.service");
const { createPassengerEsewaCheckoutRepository } = require("../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.repository");
const { commitPaymentBooking } = require("../../src/shared/commit-payment-booking");
const { rollbackUnfulfilledSeat } = require("../../src/shared/rollback-unfulfilled-seat");
const { recoverCommittedBooking, closeUnfulfilledAttempt } = require("../../src/shared/payment-attempt-recovery");
const repo = createPassengerEsewaCheckoutRepository({ EsewaPaymentAttempt: Attempt, createReservedAttempt });
let data;
before(async () => { await fixture.start(); await Promise.all([Attempt.init(), Transaction.init()]); });
after(fixture.stop);
beforeEach(async () => {
  data = await fixture.seed();
  await Promise.all([Attempt.deleteMany({}), Transaction.deleteMany({}), fixture.Booking.deleteMany({}), fixture.Ledger.deleteMany({})]);
  await Trip.updateOne({ _id: data.tripId }, { $set: { status: "scheduled" } });
  await fixture.Ledger.create({ userId: data.userId, type: "ADMIN_CREDIT", direction: "CREDIT",
    status: "ACTIVE", amount: 100, remainingAmount: 100, expires_at: new Date('2099-01-01') });
});
function payload(overrides = {}) {
  return { userId: data.userId, holdId: new mongoose.Types.ObjectId(), tempBookingId: "TEMP-RECOVERY",
    transactionUuid: "SM-RECOVERY", requestFingerprint: "same-input", productCode: "EPAYTEST", originalAmount: 1000, finalAmount: 1000,
    gatewayAmount: 960, smMoneyApplied: 40, walletAuthorizedAt: new Date(),
    confirmationQuote: {}, checkoutPayload: { scheduleId: data.tripId }, formFields: {},
    holdExpiresAt: new Date(Date.now() + 60000), ...overrides };
}
async function reserveAndClaim() {
  await createReservedAttempt(payload());
  return repo.claimOwnedAttempt("SM-RECOVERY", data.userId, 90000);
}
const balance = async () => (await fixture.ledgerService.computeSpendableBalance(data.userId)).display;
function booking(attempt) {
  return { userId: data.userId, tripId: data.tripId, ticketId: "RECOVERY-TICKET", seats: ["A1"],
    status: "booked", paymentMethod: "SM_WALLET_SPLIT", transactionId: attempt.transactionUuid,
    originalAmount: 1000, totalAmount: 1000, smMoneyUsed: 40, gatewayAmount: 960,
    smDebitEntryId: attempt.reservedLedgerEntryId };
}
const commit = attempt => commitPaymentBooking(booking(attempt), { attemptId: attempt._id, processingToken: attempt.processingToken });
const close = attempt => closeUnfulfilledAttempt(attempt, { status: "FAILED", createDispute: false,
  reason: "Provider confirms cancellation", result: { statusCode: 410, body: { success: false } } });

test("reservation is atomic, and missing authorization leaves no attempt or debit", async () => {
  await assert.rejects(() => createReservedAttempt(payload({ walletAuthorizedAt: null })), /authorization/);
  assert.equal(await Attempt.countDocuments({}), 0);
  assert.equal(await balance(), 100);
  await reserveAndClaim();
  assert.equal(await balance(), 60);
  assert.equal(await fixture.Ledger.countDocuments({ type: "DEBIT" }), 1);
});
test("twenty identical initiation retries reserve once and changed requests are rejected", async () => {
  const input = payload();
  const attempts = await Promise.all(Array.from({ length: 20 }, () => repo.createAttempt(input)));
  assert.equal(new Set(attempts.map(attempt => String(attempt._id))).size, 1);
  assert.equal(await Attempt.countDocuments({}), 1);
  assert.equal(await fixture.Ledger.countDocuments({ type: "DEBIT" }), 1);
  assert.equal(await balance(), 60);
  await assert.rejects(() => repo.createAttempt({ ...input, requestFingerprint: "changed-input" }), /different/);
});
test("a crash after booking commit recovers the result without charging or refunding again", async () => {
  const attempt = await reserveAndClaim();
  const saved = await commit(attempt);
  const completed = await Attempt.findById(attempt._id);
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.result, null);
  const recovered = await recoverCommittedBooking(completed);
  assert.equal(String(recovered.body.data.bookingId), String(saved._id));
  assert.equal((await rollbackUnfulfilledSeat({ tripId: data.tripId, arrayField: 'seata', seatNo: 'A1', userId: data.userId })).protected, true);
  assert.equal((await fixture.Seat.findOne({ tripId: data.tripId })).seata[0].booked, true);
  await assert.rejects(() => close(attempt), /ownership/);
  await assert.rejects(() => fixture.ledgerService.reverseDebit(attempt.reservedLedgerEntryId), /booking/i);
  assert.equal(await balance(), 60);
  assert.equal(await fixture.Booking.countDocuments({}), 1);
});
test("expired processing ownership cannot commit or overwrite a new worker", async () => {
  const stale = await reserveAndClaim();
  await Attempt.updateOne({ _id: stale._id }, { $set: { processingExpiresAt: new Date(0) } });
  const current = await repo.claimOwnedAttempt(stale.transactionUuid, data.userId, 90000);
  await assert.rejects(() => commit(stale), /ownership/);
  await assert.rejects(() => repo.updateAttempt(stale._id, { status: "FAILED" }, stale.processingToken), /ownership/);
  await commit(current);
  assert.equal(await balance(), 60);
});
test("concurrent booking and compensation have one financial outcome", async () => {
  const attempt = await reserveAndClaim();
  const outcomes = await Promise.allSettled([commit(attempt), close(attempt)]);
  assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 1);
  const count = await fixture.Booking.countDocuments({});
  assert.equal(await balance(), count ? 60 : 100);
  assert.equal(await fixture.Ledger.countDocuments({ type: "DEBIT_REVERSAL" }), count ? 0 : 1);
});
test("freezing the wallet or cancelling the trip blocks booking commit", async () => {
  const attempt = await reserveAndClaim();
  await fixture.Wallet.updateOne({ userId: data.userId }, { $set: { status: "frozen" } });
  await assert.rejects(() => commit(attempt), /frozen/);
  assert.equal((await Attempt.findById(attempt._id)).status, "VERIFYING");
  await fixture.Wallet.updateOne({ userId: data.userId }, { $set: { status: "active" } });
  await Trip.updateOne({ _id: data.tripId }, { $set: { status: "cancelled" } });
  await assert.rejects(() => commit(attempt), /Trip/);
  await close(attempt);
  assert.equal(await balance(), 100);
});
