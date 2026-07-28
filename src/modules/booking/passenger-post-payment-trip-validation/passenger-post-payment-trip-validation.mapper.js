'use strict';

/**
 * src/modules/booking/passenger-post-payment-trip-validation/passenger-post-payment-trip-validation.mapper.js
 * Mapper functions for passenger post-payment trip validation failures.
 */

function mapPostPaymentTripNotFound(transactionId) {
  return {
    ok: false,
    statusCode: 404,
    body: {
      success: false,
      message: `Your payment was received but the trip was not found. Your case ID is ${transactionId}. We will resolve this within 2 hours.`,
      caseId: transactionId,
      errorCode: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED',
    },
    disputeReason: 'Trip not found after payment verification',
    compensationReason: 'Trip not found after payment',
    adminAlertReason: 'Trip not found after payment verification',
  };
}

function mapPostPaymentBookingWindowClosed(transactionId) {
  return {
    ok: false,
    statusCode: 400,
    body: {
      success: false,
      message: `Your payment was received but booking has closed for this trip. Your case ID is ${transactionId}. We will resolve this within 2 hours.`,
      caseId: transactionId,
      errorCode: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED',
    },
    disputeReason: 'Booking window closed after payment was processed',
    compensationReason: 'Booking window closed after payment',
    adminAlertReason: 'Booking window closed after payment was processed',
  };
}

function mapPostPaymentTripStatusNotBookable({ transactionId, tripStatus }) {
  return {
    ok: false,
    statusCode: 400,
    body: {
      success: false,
      message: `Your payment was received but the trip is no longer available (status: ${tripStatus}). Your case ID is ${transactionId}. We will resolve this within 2 hours.`,
      caseId: transactionId,
      errorCode: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED',
    },
    disputeReason: `Trip status is "${tripStatus}" — not bookable after payment`,
    compensationReason: `Trip status "${tripStatus}" not bookable`,
    adminAlertReason: `Trip status is "${tripStatus}" — not bookable`,
  };
}

module.exports = {
  mapPostPaymentTripNotFound,
  mapPostPaymentBookingWindowClosed,
  mapPostPaymentTripStatusNotBookable,
};
