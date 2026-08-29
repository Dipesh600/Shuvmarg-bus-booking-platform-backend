'use strict';

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

const parseHold = (body) => {
  const errors = [];
  const tripId = body && typeof body === 'object' ? body.tripId : undefined;
  const seatNumbers = body && typeof body === 'object' ? body.seatNumbers : undefined;
  if (typeof tripId !== 'string' || !OBJECT_ID_RE.test(tripId)) {
    errors.push('tripId must be a valid id.');
  }
  if (!Array.isArray(seatNumbers) || seatNumbers.length === 0) {
    errors.push('seatNumbers must be a non-empty array.');
  } else if (seatNumbers.some((seat) => typeof seat !== 'string' || !seat.trim())) {
    errors.push('Every seat number must be a non-empty string.');
  }
  return { errors, value: { tripId, seatNumbers } };
};

module.exports = { parseHold };
