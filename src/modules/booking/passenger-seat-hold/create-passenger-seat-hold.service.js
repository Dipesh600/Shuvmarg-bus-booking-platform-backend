'use strict';

/**
 * src/modules/booking/passenger-seat-hold/create-passenger-seat-hold.service.js
 *
 * Atomic seat-hold acquisition and reuse service for passengers.
 */

const repository = require('./passenger-seat-hold.repository');
const policy = require('./passenger-seat-hold.policy');
const errors = require('./passenger-seat-hold.errors');

const DEFAULT_HOLD_DURATION_MS = 10 * 60 * 1000;

const isDuplicateKeyError = (err) => err && (err.code === 11000 || (err.message && err.message.includes('E11000')));

const toCanonicalHoldObject = (doc) => ({
  _id: doc._id,
  tripId: doc.tripId,
  userId: doc.userId,
  seatNumbers: doc.seatNumbers,
  tempBookingId: doc.tempBookingId,
  status: doc.status,
  expiresAt: doc.expiresAt,
  completedAt: doc.completedAt || null,
});

const createOrReusePassengerSeatHold = async ({
  userId,
  tripId,
  seatNumbers,
  now = new Date(),
  holdDurationMs = DEFAULT_HOLD_DURATION_MS,
}) => {
  const normalizedSeats = policy.normalizeSeatNumbers(seatNumbers);
  const seatKeys = policy.buildSeatKeys(tripId, normalizedSeats);
  const userTripKey = policy.buildUserTripKey(userId, tripId);

  await repository.deleteExpiredConflicts(userTripKey, seatKeys, userId, tripId, now);

  const legacyConflicts = await repository.findActiveLegacyConflicts(tripId, normalizedSeats, userId, now);
  if (legacyConflicts.length > 0) {
    throw errors.seatTemporarilyHeldError();
  }

  let existingHold = await repository.findActiveHoldForUserTrip(userId, tripId, userTripKey, now);

  if (existingHold) {
    if (!policy.isLegacyHold(existingHold) && policy.sameSeatSet(existingHold.seatNumbers, normalizedSeats)) {
      return toCanonicalHoldObject(existingHold);
    }

    try {
      const updated = await repository.updateOwnedActiveHold(
        existingHold._id, userId, tripId, normalizedSeats, seatKeys, userTripKey, now
      );
      if (updated) return toCanonicalHoldObject(updated);
    } catch (err) {
      if (isDuplicateKeyError(err)) throw errors.seatTemporarilyHeldError();
      throw err;
    }

    // Atomic update returned null (hold expired or changed concurrently) — re-read authoritative state
    existingHold = await repository.findActiveHoldForUserTrip(userId, tripId, userTripKey, now);
    if (existingHold) {
      if (policy.sameSeatSet(existingHold.seatNumbers, normalizedSeats)) {
        return toCanonicalHoldObject(existingHold);
      }
      try {
        const retriedUpdate = await repository.updateOwnedActiveHold(
          existingHold._id, userId, tripId, normalizedSeats, seatKeys, userTripKey, now
        );
        if (retriedUpdate) return toCanonicalHoldObject(retriedUpdate);
      } catch (err) {
        if (isDuplicateKeyError(err)) throw errors.seatTemporarilyHeldError();
        throw err;
      }
    }
  }

  const tempBookingId = policy.generateTempBookingId();
  const expiresAt = new Date(now.getTime() + holdDurationMs);

  try {
    const newHold = await repository.createHold({
      tripId,
      userId,
      seatNumbers: normalizedSeats,
      seatKeys,
      userTripKey,
      tempBookingId,
      status: 'held',
      expiresAt,
    });
    return toCanonicalHoldObject(newHold);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const reRead = await repository.findActiveHoldForUserTrip(userId, tripId, userTripKey, now);
      if (reRead && policy.sameSeatSet(reRead.seatNumbers, normalizedSeats)) {
        return toCanonicalHoldObject(reRead);
      }
      throw errors.seatTemporarilyHeldError();
    }
    throw err;
  }
};

module.exports = {
  createOrReusePassengerSeatHold,
};
