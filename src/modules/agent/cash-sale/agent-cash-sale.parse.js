'use strict';

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const limits = { passengerName: 100, passengerPhone: 32, boardingPoint: 200, droppingPoint: 200 };

const parseText = (body, key, required, errors) => {
  const value = body && typeof body === 'object' ? body[key] : undefined;
  if (value === undefined || value === null) {
    if (required) errors.push(`${key} is required.`);
    return null;
  }
  if (typeof value !== 'string') {
    errors.push(`${key} must be a string.`);
    return null;
  }
  const clean = value.trim();
  if (required && !clean) errors.push(`${key} is required.`);
  if (clean.length > limits[key]) errors.push(`${key} must be at most ${limits[key]} characters.`);
  return clean || null;
};

const parseSale = (body) => {
  const errors = [];
  const holdId = body && typeof body === 'object' ? body.holdId : undefined;
  if (typeof holdId !== 'string' || !OBJECT_ID_RE.test(holdId)) {
    errors.push('holdId must be a valid id.');
  }
  const passengerName = parseText(body, 'passengerName', true, errors);
  const passengerPhone = parseText(body, 'passengerPhone', true, errors);
  const boardingPoint = parseText(body, 'boardingPoint', false, errors);
  const droppingPoint = parseText(body, 'droppingPoint', false, errors);
  const rawPrice = body && typeof body === 'object' ? body.ticketPrice : undefined;
  const ticketPrice = rawPrice === undefined ? 0 : rawPrice;
  if (!Number.isFinite(ticketPrice) || ticketPrice < 0 || ticketPrice > Number.MAX_SAFE_INTEGER) {
    errors.push('ticketPrice must be a non-negative number.');
  }
  return { errors, value: { holdId, passengerName, passengerPhone, boardingPoint, droppingPoint, ticketPrice } };
};

module.exports = { parseSale };
