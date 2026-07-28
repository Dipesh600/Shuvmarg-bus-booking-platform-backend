'use strict';

function createPassengerEsewaCheckoutRepository({
  EsewaPaymentAttempt,
  SeatHold,
  Transaction,
  clock = () => new Date(),
}) {
  async function createAttempt(payload) {
    try {
      return await EsewaPaymentAttempt.create(payload);
    } catch (error) {
      if (error?.code !== 11000) throw error;
      return EsewaPaymentAttempt.findOne({
        tempBookingId: payload.tempBookingId,
        userId: payload.userId,
      });
    }
  }

  function findOwnedAttempt(transactionUuid, userId) {
    return EsewaPaymentAttempt.findOne({ transactionUuid, userId });
  }

  function claimOwnedAttempt(transactionUuid, userId, leaseMs) {
    const now = clock();
    return EsewaPaymentAttempt.findOneAndUpdate(
      {
        transactionUuid,
        userId,
        $or: [
          { status: 'INITIATED' },
          {
            status: 'VERIFYING',
            processingExpiresAt: { $lte: now },
          },
        ],
      },
      {
        $set: {
          status: 'VERIFYING',
          processingExpiresAt: new Date(now.getTime() + leaseMs),
        },
      },
      { new: true }
    );
  }

  function updateAttempt(id, update) {
    return EsewaPaymentAttempt.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true }
    );
  }

  function findHoldByAttempt(attempt) {
    return SeatHold.findOne({
      _id: attempt.holdId,
      userId: attempt.userId,
      tempBookingId: attempt.tempBookingId,
    }).lean();
  }

  function findTransactionByPaymentId(transactionUuid, userId) {
    return Transaction.findOne({ transactionId: transactionUuid, userId });
  }

  function createDisputedTransaction(attempt, reason) {
    return Transaction.create({
      userId: attempt.userId,
      tripId: attempt.checkoutPayload.scheduleId,
      seats: attempt.checkoutPayload.seatNumbers,
      transactionType: 'BOOKING',
      gateway: 'esewa',
      transactionId: attempt.transactionUuid,
      originalAmount: attempt.originalAmount,
      totalAmount: attempt.finalAmount,
      status: 'DISPUTED',
      paidAt: clock(),
      failureReason: reason,
      disputeReason: reason,
      meta: {
        tempBookingId: attempt.tempBookingId,
        gatewayAmount: attempt.gatewayAmount,
        smMoneyUsed: attempt.smMoneyApplied,
        paymentAttemptId: attempt._id,
      },
    });
  }

  return {
    createAttempt,
    findOwnedAttempt,
    claimOwnedAttempt,
    updateAttempt,
    findHoldByAttempt,
    findTransactionByPaymentId,
    createDisputedTransaction,
  };
}

module.exports = { createPassengerEsewaCheckoutRepository };
