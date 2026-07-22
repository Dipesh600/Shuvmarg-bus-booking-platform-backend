'use strict';

/**
 * src/modules/booking/passenger-seat-hold/passenger-seat-hold.policy.js
 *
 * Pure validation and transformation functions for passenger seat holds.
 */

const crypto = require('node:crypto');
const errors = require('./passenger-seat-hold.errors');

const normalizeSeatNumbers = (seatNumbers) => {
  if (!Array.isArray(seatNumbers) || seatNumbers.length === 0) {
    throw errors.invalidSeatSelectionError('seatNumbers must be a non-empty array.');
  }

  const seen = new Set();
  const normalized = [];

  for (const s of seatNumbers) {
    if (typeof s !== 'string' || !s.trim()) {
      throw errors.invalidSeatSelectionError('Every seat number must be a non-empty string.');
    }
    const clean = s.trim().toLowerCase();
    if (seen.has(clean)) {
      throw errors.invalidSeatSelectionError(`Duplicate seat number detected: ${s.trim()}`);
    }
    seen.add(clean);
    normalized.push(clean);
  }

  return normalized.sort();
};

const buildSeatKeys = (tripId, normalizedSeats) => {
  const strTripId = String(tripId);
  return normalizedSeats.map((seat) => `${strTripId}:${seat}`);
};

const buildUserTripKey = (userId, tripId) => `${String(userId)}:${String(tripId)}`;

const sameSeatSet = (left, right) => {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  const normLeft = [...left].map((s) => String(s).trim().toLowerCase()).sort();
  const normRight = [...right].map((s) => String(s).trim().toLowerCase()).sort();
  return normLeft.every((val, idx) => val === normRight[idx]);
};

const isActiveHold = (hold, now = new Date()) => {
  if (!hold) return false;
  if (hold.status !== 'held') return false;
  return new Date(hold.expiresAt) > now;
};

const isLegacyHold = (hold) => {
  if (!hold) return false;
  return !hold.seatKeys || hold.seatKeys.length === 0;
};

const generateTempBookingId = () => `BH${crypto.randomBytes(12).toString('hex')}`;

module.exports = {
  normalizeSeatNumbers,
  buildSeatKeys,
  buildUserTripKey,
  sameSeatSet,
  isActiveHold,
  isLegacyHold,
  generateTempBookingId,
};
