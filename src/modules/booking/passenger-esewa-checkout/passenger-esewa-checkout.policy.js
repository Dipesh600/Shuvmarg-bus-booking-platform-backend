'use strict';

const { randomUUID } = require('crypto');

function createTransactionUuid(now = new Date(), uuid = randomUUID()) {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `SM-${date}-${uuid.replace(/-/g, '').slice(0, 20)}`;
}

function normalizePassengerDetails(details, heldSeats) {
  if (!Array.isArray(details) || details.length !== heldSeats.length) {
    throw validationError('Passenger details must match every held seat.');
  }
  const allowedSeats = new Set(heldSeats.map((seat) => String(seat)));
  const seenSeats = new Set();
  const normalized = details.map((passenger) => {
    const name = String(passenger?.name || '').trim();
    const seatNo = String(passenger?.seatNo || '').trim().toLowerCase();
    const gender = String(passenger?.gender || '').toLowerCase();
    const normalizedGender =
      gender === 'm' ? 'male' : gender === 'f' ? 'female' : gender;
    if (
      name.length < 2 || name.length > 80 ||
      !allowedSeats.has(seatNo) || seenSeats.has(seatNo) ||
      !['male', 'female', 'other'].includes(normalizedGender)
    ) {
      throw validationError('Passenger details are invalid for the held seats.');
    }
    seenSeats.add(seatNo);
    return { name, gender: normalizedGender, seatNo };
  });
  return normalized;
}

function normalizePoint(point, label) {
  const name = String(point?.name || '').trim();
  const time = String(point?.time || '').trim();
  if (!name || name.length > 120 || time.length > 40) {
    throw validationError(`${label} is invalid.`);
  }
  return { name, time: time || null };
}

function normalizeOptionalText(value, maxLength = 120) {
  if (value === undefined || value === null || value === '') return null;
  const normalized = String(value).trim();
  if (!normalized || normalized.length > maxLength) {
    throw validationError('Checkout details are invalid.');
  }
  return normalized;
}

function formatAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw validationError('The payable eSewa amount is invalid.');
  }
  return amount.toFixed(2).replace(/\.?0+$/, '');
}

function validationError(message) {
  const error = new Error(message);
  error.code = 'ESEWA_CHECKOUT_INVALID';
  error.statusCode = 400;
  return error;
}

module.exports = {
  createTransactionUuid,
  normalizePassengerDetails,
  normalizePoint,
  normalizeOptionalText,
  formatAmount,
  validationError,
};
