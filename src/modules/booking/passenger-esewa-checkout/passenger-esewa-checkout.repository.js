'use strict';

function createPassengerEsewaCheckoutRepository({
  EsewaPaymentAttempt,
  SeatHold,
  Transaction,
  Trip,
  clock = () => new Date(),
}) {
  function findCheckoutTrip(tripId) {
    return Trip.findById(tripId)
      .select('busId routeId variantId scheduleId fromStopName toStopName departureTime arrivalTime')
      .populate({
        path: 'busId',
        select: 'boardingPointId',
        populate: {
          path: 'boardingPointId',
          select: 'boardingPoints droppingPoints -_id',
        },
      })
      .populate('routeId', 'from to -_id')
      .populate({
        path: 'variantId',
        select: 'direction corridorId',
        populate: {
          path: 'corridorId',
          select: 'originId destinationId',
          populate: [
            { path: 'originId', select: 'name -_id' },
            { path: 'destinationId', select: 'name -_id' },
          ],
        },
      })
      .populate({
        path: 'scheduleId',
        select: 'operatorRouteConfigId',
        populate: {
          path: 'operatorRouteConfigId',
          select: 'boardingConfig timingConfig returnBoardingConfig returnTimingConfig',
          populate: [
            {
              path: 'boardingConfig.stopId returnBoardingConfig.stopId',
              select: 'name',
            },
            {
              path: 'boardingConfig.boardingPointIds returnBoardingConfig.boardingPointIds',
              select: 'pointName type -_id',
            },
          ],
        },
      })
      .lean();
  }

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
    findCheckoutTrip,
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
