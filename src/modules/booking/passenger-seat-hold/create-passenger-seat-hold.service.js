'use strict';

/**
 * src/modules/booking/passenger-seat-hold/create-passenger-seat-hold.service.js
 *
 * Atomic seat-hold acquisition and reuse service for passengers.
 */

const repository = require('./passenger-seat-hold.repository');
const policy = require('./passenger-seat-hold.policy');
const errors = require('./passenger-seat-hold.errors');
const {
  PASSENGER_SEAT_HOLD_DURATION_MS,
} = require('./passenger-seat-hold.constants');

const isDuplicateKeyError = (err) => err && (err.code === 11000 || (err.message && err.message.includes('E11000')));

const toCanonicalHoldObject = (doc) => ({
  _id: doc._id,
  tripId: doc.tripId,
  userId: doc.userId,
  seatNumbers: doc.seatNumbers,
  tempBookingId: doc.tempBookingId,
  status: doc.status,
  expiresAt: doc.expiresAt,
  originalAmount: doc.originalAmount,
  completedAt: doc.completedAt || null,
});

const isCanonicalActiveHold = (doc, now) =>
  doc &&
  !policy.isLegacyHold(doc) &&
  Array.isArray(doc.seatKeys) && doc.seatKeys.length > 0 &&
  Boolean(doc.userTripKey) &&
  policy.isActiveHold(doc, now);

const createOrReusePassengerSeatHold = async ({
  userId,
  tripId,
  seatNumbers,
  originalAmount,
  now = new Date(),
  holdDurationMs = PASSENGER_SEAT_HOLD_DURATION_MS,
}) => {
  const normalizedSeats = policy.normalizeSeatNumbers(seatNumbers);
  if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
    throw errors.invalidSeatSelectionError(
      'A valid server-calculated booking amount is required.'
    );
  }
  const v3Places = typeof repository.findTripSeatLayoutAvailability === 'function'
    ? await repository.findTripSeatLayoutAvailability(tripId) : null;
  if (v3Places) {
    const available = new Map(v3Places.map((place) => [place.label.toLowerCase(), place.state]));
    const invalid = normalizedSeats.filter((label) => available.get(label) !== 'OPEN');
    if (invalid.length) {
      throw errors.invalidSeatSelectionError('One or more selected passenger places are withdrawn or unavailable.');
    }
  }
  const seatKeys = policy.buildSeatKeys(tripId, normalizedSeats);
  const userTripKey = policy.buildUserTripKey(userId, tripId);

  await repository.deleteExpiredConflicts(userTripKey, seatKeys, userId, tripId, now);

  const legacyConflicts = await repository.findActiveLegacyConflicts(tripId, normalizedSeats, userId, now);
  if (legacyConflicts.length > 0) {
    throw errors.seatTemporarilyHeldError();
  }

  let existingHold = await repository.findActiveHoldForUserTrip(userId, tripId, userTripKey, now);

  if (existingHold) {
    if (
      isCanonicalActiveHold(existingHold, now) &&
      policy.sameSeatSet(existingHold.seatNumbers, normalizedSeats) &&
      existingHold.originalAmount === originalAmount
    ) {
      return toCanonicalHoldObject(existingHold);
    }

    try {
      const updated = await repository.updateOwnedActiveHold(
        existingHold._id, userId, tripId, normalizedSeats, seatKeys,
        userTripKey, originalAmount, now
      );
      if (updated && isCanonicalActiveHold(updated, now)) return toCanonicalHoldObject(updated);
    } catch (err) {
      if (isDuplicateKeyError(err)) throw errors.seatTemporarilyHeldError();
      throw err;
    }

    // Atomic update returned null (hold expired or changed concurrently) — re-read authoritative state
    existingHold = await repository.findActiveHoldForUserTrip(userId, tripId, userTripKey, now);
    if (existingHold) {
      try {
        const retriedUpdate = await repository.updateOwnedActiveHold(
          existingHold._id, userId, tripId, normalizedSeats, seatKeys,
          userTripKey, originalAmount, now
        );
        if (retriedUpdate && isCanonicalActiveHold(retriedUpdate, now)) return toCanonicalHoldObject(retriedUpdate);
      } catch (err) {
        if (isDuplicateKeyError(err)) throw errors.seatTemporarilyHeldError();
        throw err;
      }

      const finalHold = await repository.findActiveHoldForUserTrip(userId, tripId, userTripKey, now);
      if (
        isCanonicalActiveHold(finalHold, now) &&
        policy.sameSeatSet(finalHold.seatNumbers, normalizedSeats) &&
        finalHold.originalAmount === originalAmount
      ) {
        return toCanonicalHoldObject(finalHold);
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
      originalAmount,
    });
    return toCanonicalHoldObject(newHold);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      const reRead = await repository.findActiveHoldForUserTrip(userId, tripId, userTripKey, now);
      if (
        isCanonicalActiveHold(reRead, now) &&
        policy.sameSeatSet(reRead.seatNumbers, normalizedSeats) &&
        reRead.originalAmount === originalAmount
      ) {
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
