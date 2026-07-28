'use strict';

/**
 * src/modules/booking/passenger-seat-hold/require-passenger-seat-hold.service.js
 *
 * Hold validation for confirmation flow and completion logic post-booking.
 */

const repository = require('./passenger-seat-hold.repository');
const confirmationRepository = require(
  './passenger-seat-hold-confirmation.repository'
);
const policy = require('./passenger-seat-hold.policy');
const errors = require('./passenger-seat-hold.errors');

const validateConfirmationHold = async ({
  tempBookingId,
  userId,
  clientTripId,
  clientSeats,
  now = new Date(),
}) => {
  if (!tempBookingId) {
    throw errors.bookingHoldInvalidError();
  }

  const hold = await repository.findOwnedActiveHoldByTempId(tempBookingId, userId, now);
  if (!hold || !policy.isActiveHold(hold, now)) {
    throw errors.bookingHoldInvalidError();
  }
  if (!Number.isFinite(hold.originalAmount) || hold.originalAmount <= 0) {
    throw errors.bookingHoldInvalidError();
  }

  if (clientTripId !== undefined && clientTripId !== null) {
    if (typeof clientTripId !== 'string' || !clientTripId.trim() || String(clientTripId).trim() !== String(hold.tripId)) {
      throw errors.bookingHoldMismatchError();
    }
  }

  if (clientSeats !== undefined && clientSeats !== null) {
    if (!Array.isArray(clientSeats) || clientSeats.length === 0) {
      throw errors.bookingHoldMismatchError();
    }
    try {
      const normalizedClient = policy.normalizeSeatNumbers(clientSeats);
      if (!policy.sameSeatSet(normalizedClient, hold.seatNumbers)) {
        throw errors.bookingHoldMismatchError();
      }
    } catch (err) {
      throw errors.bookingHoldMismatchError();
    }
  }

  return {
    _id: hold._id,
    tripId: hold.tripId,
    userId: hold.userId,
    seatNumbers: hold.seatNumbers,
    tempBookingId: hold.tempBookingId,
    status: hold.status,
    expiresAt: hold.expiresAt,
    originalAmount: hold.originalAmount,
  };
};

const completePassengerHold = async ({ holdId, userId, now = new Date() }) => {
  try {
    const result = await repository.completeOwnedHold(holdId, userId, now);
    if (!result || result.matchedCount === 0) {
      console.warn(`[passenger-seat-hold] Completion warning: hold ${holdId} for user ${userId} not found in held status.`);
    }
    return result;
  } catch (err) {
    console.error(`[passenger-seat-hold] Completion cleanup failed for hold ${holdId}:`, err.message);
    return null;
  }
};

const claimPassengerHoldForConfirmation = async ({
  holdId,
  userId,
  heldExpiresAt,
  now = new Date(),
}) => {
  return Boolean(await confirmationRepository.claimOwnedActiveHold(
    holdId, userId, heldExpiresAt, now
  ));
};

const restorePassengerHoldAfterFailedConfirmation = async ({
  holdId,
  userId,
  heldExpiresAt,
  now = new Date(),
}) => {
  try {
    return await confirmationRepository.restoreOwnedProcessingHold(
      holdId, userId, heldExpiresAt, now
    );
  } catch (error) {
    console.error(
      `[passenger-seat-hold] Failed to restore hold ${holdId}:`,
      error.message
    );
    return null;
  }
};

module.exports = {
  validateConfirmationHold,
  completePassengerHold,
  claimPassengerHoldForConfirmation,
  restorePassengerHoldAfterFailedConfirmation,
};
