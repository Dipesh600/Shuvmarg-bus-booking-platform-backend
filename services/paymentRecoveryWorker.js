"use strict";
const mongoose = require("mongoose");
const Attempt = require("../models/esewaPaymentAttemptModel");
const Ledger = require("../models/smLedgerModel");
const Booking = require("../models/bookTicketModel");
const Hold = require("../models/seatHoldModel");
const ledger = require("../src/modules/wallet/sm-ledger");
const { withMongoTransaction } = require("../src/shared/with-mongo-transaction");
const { recoverCommittedBooking } = require("../src/shared/payment-attempt-recovery");
const logger = require("../utils/logger");

async function recoverWalletDebit(debitId) {
  return withMongoTransaction(mongoose, null, async session => {
    const debit = await Ledger.findById(debitId).session(session);
    if (!debit || debit.fulfilledBookingId || debit.reversalEntryId) return;
    if (debit.paymentContext?.gateway !== "wallet") return;
    const booking = await Booking.exists({ smDebitEntryId: debit._id }).session(session);
    if (booking) return;
    const hold = await Hold.findOne({ tempBookingId: debit.paymentContext.tempBookingId, userId: debit.userId }).session(session);
    if (hold && new Date(hold.expiresAt).getTime() > Date.now()) return;
    await ledger.reverseDebit(debit._id, { session });
  });
}

async function runPaymentRecovery({ reconcilePaymentAttempt = input => require("../src/modules/booking/passenger-esewa-checkout").reconcilePaymentAttempt(input) } = {}) {
  const stale = new Date(Date.now() - 30 * 1000);
  const attempts = await Attempt.find({ $or: [
    { status: "INITIATED", updatedAt: { $lt: stale } },
    { status: "VERIFYING", processingExpiresAt: { $lt: new Date() } },
    { status: "COMPLETED", result: null },
  ] }).sort({ updatedAt: 1 }).limit(100);
  for (const attempt of attempts) {
    try {
      if (attempt.status === "COMPLETED") await recoverCommittedBooking(attempt);
      else await reconcilePaymentAttempt({
        userId: attempt.userId, activeRole: "passenger", transactionUuid: attempt.transactionUuid,
      });
    } catch (error) { logger.error("Payment attempt recovery requires retry", { attemptId: attempt._id, error: error.message }); }
  }
  const debits = await Ledger.find({ type: "DEBIT", "paymentContext.gateway": "wallet",
    fulfilledBookingId: null, reversalEntryId: null, createdAt: { $lt: stale } }).sort({ updatedAt: 1 }).limit(100);
  for (const debit of debits) {
    try { await recoverWalletDebit(debit._id); }
    catch (error) { logger.error("Wallet payment recovery requires review", { debitId: debit._id, error: error.message }); }
  }
  for (const recover of [require("./bookingCashbackRecovery").recoverBookingCashback,
    require("./bookingNotificationRecovery").recoverBookingNotifications,
    require('./paymentRefundRecovery').recoverPaymentRefunds]) {
    try { await recover(); }
    catch (error) { logger.error("Booking follow-up recovery requires retry", { error: error.message }); }
  }
}

module.exports = { runPaymentRecovery, recoverWalletDebit };
