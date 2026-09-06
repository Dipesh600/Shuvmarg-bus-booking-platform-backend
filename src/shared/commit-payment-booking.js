"use strict";
const mongoose = require("mongoose");
const Booking = require("../../models/bookTicketModel");
const Trip = require("../../models/tripModel");
const Attempt = require("../../models/esewaPaymentAttemptModel");
const Ledger = require("../../models/smLedgerModel");
const { lockWalletForDebit } = require("../modules/wallet/sm-ledger/sm-ledger-wallet-lock");
const { withMongoTransaction } = require("./with-mongo-transaction");
const { toMinorUnits } = require("./money");

async function commitPaymentBooking(payload, { attemptId, processingToken } = {}) {
  return withMongoTransaction(mongoose, null, async session => {
    const paymentOperationKey = `${attemptId ? "esewa" : payload.paymentMethod}:${payload.transactionId}`;
    const existing = await Booking.findOne({ paymentOperationKey }).session(session);
    if (existing) {
      if (String(existing.userId) !== String(payload.userId) || String(existing.tripId) !== String(payload.tripId)
        || toMinorUnits(existing.totalAmount) !== toMinorUnits(payload.totalAmount)) throw new Error("Payment already belongs to another booking");
      return existing;
    }
    const trip = await Trip.findOneAndUpdate({ _id: payload.tripId, status: { $in: ["scheduled", "boarding"] } },
      { $inc: { paymentCommitSequence: 1 } }, { session, new: true });
    if (!trip) throw new Error("Trip is no longer available for booking");
    const bookingId = new mongoose.Types.ObjectId();
    if (attemptId) {
      const claimed = await Attempt.findOneAndUpdate({ _id: attemptId, userId: payload.userId,
        status: "VERIFYING", processingToken, processingExpiresAt: { $gt: new Date() } },
      { $set: { status: "COMPLETED", bookingId } }, { session, new: true });
      if (!claimed) throw Object.assign(new Error("Payment processing ownership expired"), { code: "PAYMENT_LEASE_LOST" });
      if (toMinorUnits(claimed.smMoneyApplied) !== toMinorUnits(payload.smMoneyUsed || 0)
        || toMinorUnits(claimed.gatewayAmount) !== toMinorUnits(payload.gatewayAmount || 0)
        || String(claimed.reservedLedgerEntryId || "") !== String(payload.smDebitEntryId || "")) {
        throw new Error("Payment allocation changed before booking commit");
      }
    }
    if (payload.smDebitEntryId) {
      await lockWalletForDebit(payload.userId, session);
      const debit = await Ledger.findById(payload.smDebitEntryId).session(session);
      const reversed = await Ledger.exists({ type: "DEBIT_REVERSAL", relatedLedgerEntryId: payload.smDebitEntryId }).session(session);
      if (!debit || debit.type !== "DEBIT" || String(debit.userId) !== String(payload.userId)
        || toMinorUnits(debit.amount) !== toMinorUnits(payload.smMoneyUsed) || debit.reversalEntryId || reversed
        || debit.fulfilledBookingId || debit.note?.includes("[REVERSED]")) {
        throw new Error("SM payment is reversed, consumed, or inconsistent");
      }
      await Ledger.updateOne({ _id: debit._id }, { $set: { fulfilledBookingId: bookingId, bookingId } }, { session });
    }
    const [booking] = await Booking.create([{ ...payload, _id: bookingId, paymentOperationKey }], { session });
    return booking;
  });
}

module.exports = { commitPaymentBooking };
