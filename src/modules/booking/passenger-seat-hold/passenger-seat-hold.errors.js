'use strict';

/**
 * src/modules/booking/passenger-seat-hold/passenger-seat-hold.errors.js
 *
 * AppError factories for passenger seat hold and booking authorization.
 */

const AppError = require('../../../shared/errors/app-error');

const invalidSeatSelectionError = (message) =>
  new AppError(message || 'Invalid seat selection.', 400, {
    success: false,
    message: message || 'Invalid seat selection.',
    errorCode: 'INVALID_SEAT_SELECTION',
  });

const seatTemporarilyHeldError = () =>
  new AppError('One or more selected seats are temporarily unavailable.', 409, {
    success: false,
    message: 'One or more selected seats are temporarily unavailable.',
    errorCode: 'SEAT_TEMPORARILY_HELD',
  });

const bookingHoldInvalidError = () =>
  new AppError('The booking hold is invalid or has expired. Please select the seats again.', 409, {
    success: false,
    message: 'The booking hold is invalid or has expired. Please select the seats again.',
    errorCode: 'BOOKING_HOLD_INVALID',
  });

const bookingHoldMismatchError = () =>
  new AppError('The booking request does not match the active seat hold.', 409, {
    success: false,
    message: 'The booking request does not match the active seat hold.',
    errorCode: 'BOOKING_HOLD_MISMATCH',
  });

const legacyBookingFlowRetiredError = () =>
  new AppError('This booking endpoint has been retired. Use the prepare and confirm booking flow.', 410, {
    success: false,
    message: 'This booking endpoint has been retired. Use the prepare and confirm booking flow.',
    errorCode: 'LEGACY_BOOKING_FLOW_RETIRED',
  });

module.exports = {
  invalidSeatSelectionError,
  seatTemporarilyHeldError,
  bookingHoldInvalidError,
  bookingHoldMismatchError,
  legacyBookingFlowRetiredError,
};
