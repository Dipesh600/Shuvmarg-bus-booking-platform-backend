'use strict';

/**
 * src/modules/booking/passenger-seat-commitment/passenger-seat-commitment.mapper.js
 * Mapper functions for passenger seat commitment failure states.
 */

function mapPassengerSeatDataNotFound({ transactionId }) {
  return {
    ok: false,
    failureType: 'SEAT_DATA_NOT_FOUND',
    statusCode: 404,
    body: {
      success: false,
      message: `Your payment was received but seat data is missing. Your case ID is ${transactionId}. We will resolve this within 2 hours.`,
      caseId: transactionId,
      errorCode: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED',
    },
    disputeReason: 'Seat data not found for trip after payment',
    compensationReason: 'Seat data not found after payment',
    adminAlertReason: 'Seat data not found for trip after payment',
    rollbackRequired: false,
  };
}

function mapPassengerSeatLockFailed({
  transactionId,
  invalidSeats = [],
  alreadyBookedSeats = [],
}) {
  const reasons = [];
  if (invalidSeats.length > 0) {
    reasons.push(`Invalid seat(s): ${invalidSeats.join(', ')}`);
  }
  if (alreadyBookedSeats.length > 0) {
    reasons.push(
      `Already booked: ${alreadyBookedSeats.join(', ')} — taken during payment`
    );
  }
  const fullReason = reasons.join(' | ');

  return {
    ok: false,
    failureType: 'SEAT_LOCK_FAILED',
    statusCode: 409,
    body: {
      success: false,
      message: `Your payment was received but the requested seats are no longer available. Your case ID is ${transactionId}. We will resolve this within 2 hours. (${fullReason})`,
      caseId: transactionId,
      errorCode: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED',
    },
    disputeReason: `Seat lock failed after payment: ${fullReason}`,
    compensationReason: `Seat lock failed: ${fullReason}`,
    adminAlertReason: `Seat lock failed: ${fullReason}`,
    rollbackRequired: true,
    invalidSeats,
    alreadyBookedSeats,
    fullReason,
  };
}

module.exports = {
  mapPassengerSeatDataNotFound,
  mapPassengerSeatLockFailed,
};
