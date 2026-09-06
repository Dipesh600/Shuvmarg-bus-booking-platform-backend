"use strict";
const mongoose = require("mongoose");
const Attempt = require("../../models/esewaPaymentAttemptModel");
const Booking = require("../../models/bookTicketModel");
const Transaction = require("../../models/transactionModel");
const ledger = require("../modules/wallet/sm-ledger");
const { withMongoTransaction } = require("./with-mongo-transaction");

function bookingResult(booking, attempt) {
  return { statusCode: 201, body: { success: true, message: "Booking confirmed successfully!", data: {
    bookingId: booking._id, ticketId: booking.ticketId, seats: booking.seats,
    originalAmount: booking.originalAmount, totalAmount: booking.totalAmount,
    discountAmount: booking.discountAmount, smMoneyUsed: booking.smMoneyUsed,
    gatewayAmount: booking.gatewayAmount, paymentId: attempt.transactionUuid, gateway: "esewa",
  } } };
}

async function recoverCommittedBooking(attempt) {
  const booking = await Booking.findOne({ _id: attempt.bookingId, userId: attempt.userId,
    transactionId: attempt.transactionUuid });
  if (!booking) throw new Error("Completed payment has no matching booking; reconciliation is required");
  const result = bookingResult(booking, attempt);
  await Attempt.updateOne({ _id: attempt._id, status: "COMPLETED", bookingId: booking._id },
    { $set: { result, processingExpiresAt: null } });
  await Transaction.updateOne({ transactionId: attempt.transactionUuid, userId: attempt.userId,
    status: { $in: ["PAYMENT_RECEIVED", "PENDING"] } },
  { $set: { status: "SUCCESS", bookingId: booking._id, ticketId: booking.ticketId } });
  return result;
}

async function closeUnfulfilledAttempt(attempt, { status, result, reason, createDispute }) {
  return withMongoTransaction(mongoose, null, async session => {
    const claimed = await Attempt.findOneAndUpdate({ _id: attempt._id, status: "VERIFYING",
      processingToken: attempt.processingToken }, { $set: { status, processingExpiresAt: null } }, { session, new: true });
    if (!claimed) throw Object.assign(new Error("Payment processing ownership changed"), { code: "PAYMENT_LEASE_LOST" });
    const booking = await Booking.exists({ transactionId: attempt.transactionUuid, userId: attempt.userId }).session(session);
    if (booking) throw new Error("Booking exists; payment must be reconciled without compensation");
    if (attempt.reservedLedgerEntryId) await ledger.reverseDebit(attempt.reservedLedgerEntryId, { session });
    let transaction;
    if (createDispute) {
      transaction = await Transaction.findOne({ transactionId: attempt.transactionUuid, userId: attempt.userId }).session(session);
      if (!transaction) [transaction] = await Transaction.create([{
        userId: attempt.userId, tripId: attempt.checkoutPayload.scheduleId,
        transactionId: attempt.transactionUuid, gateway: "esewa", transactionType: "BOOKING",
        totalAmount: attempt.finalAmount, originalAmount: attempt.originalAmount,
        status: "DISPUTED", paidAt: new Date(), disputeReason: reason,
        meta: { tempBookingId: attempt.tempBookingId, paymentAttemptId: attempt._id,
          gatewayAmount: attempt.gatewayAmount, smMoneyUsed: attempt.smMoneyApplied,
          smDebitEntryId: attempt.reservedLedgerEntryId },
      }], { session });
      else if (!["REFUNDED", "SUCCESS"].includes(transaction.status)) {
        transaction.status = "DISPUTED"; transaction.disputeReason = reason; await transaction.save({ session });
      }
      result.body.caseId = transaction._id;
    }
    await Attempt.updateOne({ _id: attempt._id, processingToken: attempt.processingToken },
      { $set: { result, failureReason: reason, transactionRecordId: transaction?._id || null } }, { session });
    return result;
  });
}

module.exports = { recoverCommittedBooking, closeUnfulfilledAttempt, bookingResult };
