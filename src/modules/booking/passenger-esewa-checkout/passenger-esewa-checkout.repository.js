'use strict';
const crypto = require('node:crypto');

function createPassengerEsewaCheckoutRepository({
  EsewaPaymentAttempt,
  SeatHold,
  Transaction,
  Trip,
  clock = () => new Date(),
  createReservedAttempt,
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
      return createReservedAttempt ? await createReservedAttempt(payload) : await EsewaPaymentAttempt.create(payload);
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const existing = await EsewaPaymentAttempt.findOne({
        tempBookingId: payload.tempBookingId,
        userId: payload.userId,
      });
      if (!existing) throw error;
      if (existing.requestFingerprint !== payload.requestFingerprint || existing.status !== 'INITIATED') {
        throw Object.assign(new Error('The seat hold already has a different payment attempt'), { statusCode: 409 });
      }
      return existing;
    }
  }

  function findOwnedAttempt(transactionUuid, userId) {
    return EsewaPaymentAttempt.findOne({ transactionUuid, userId });
  }
  const findAttemptForHold = (tempBookingId, userId) => EsewaPaymentAttempt.findOne({ tempBookingId, userId });

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
          processingToken: crypto.randomUUID(),
        },
      },
      { new: true }
    );
  }

  async function updateAttempt(id, update, processingToken) {
    if (!processingToken) throw new Error('Payment processing ownership is required');
    const attempt = await EsewaPaymentAttempt.findOneAndUpdate(
      { _id: id, processingToken },
      { $set: update },
      { new: true }
    );
    if (!attempt) throw Object.assign(new Error('Payment processing ownership changed; retry the original attempt'), { code: 'PAYMENT_LEASE_LOST' });
    return attempt;
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
    findAttemptForHold,
    claimOwnedAttempt,
    updateAttempt,
    findHoldByAttempt,
    findTransactionByPaymentId,
    createDisputedTransaction,
  };
}

module.exports = { createPassengerEsewaCheckoutRepository };
