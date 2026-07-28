'use strict';

/**
 * tests/unit/booking/passenger-post-payment-trip-validation-mapper.test.js
 * Unit tests for passenger post-payment trip validation mapper.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const mapper = require('../../../src/modules/booking/passenger-post-payment-trip-validation/passenger-post-payment-trip-validation.mapper.js');

test('passengerPostPaymentTripValidationMapper unit tests', async (t) => {

  await t.test('1, 2, 10 & 11. mapPostPaymentTripNotFound returns exact 404 result shape and caseId', () => {
    const res = mapper.mapPostPaymentTripNotFound('txn_100');
    assert.deepEqual(res, {
      ok: false,
      statusCode: 404,
      body: {
        success: false,
        message: 'Your payment was received but the trip was not found. Your case ID is txn_100. We will resolve this within 2 hours.',
        caseId: 'txn_100',
        errorCode: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED',
      },
      disputeReason: 'Trip not found after payment verification',
      compensationReason: 'Trip not found after payment',
      adminAlertReason: 'Trip not found after payment verification',
    });
  });

  await t.test('3, 4, 10 & 11. mapPostPaymentBookingWindowClosed returns exact 400 result shape and caseId', () => {
    const res = mapper.mapPostPaymentBookingWindowClosed('txn_200');
    assert.deepEqual(res, {
      ok: false,
      statusCode: 400,
      body: {
        success: false,
        message: 'Your payment was received but booking has closed for this trip. Your case ID is txn_200. We will resolve this within 2 hours.',
        caseId: 'txn_200',
        errorCode: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED',
      },
      disputeReason: 'Booking window closed after payment was processed',
      compensationReason: 'Booking window closed after payment',
      adminAlertReason: 'Booking window closed after payment was processed',
    });
  });

  await t.test('5, 6, 7, 8, 9, 10 & 11. mapPostPaymentTripStatusNotBookable incorporates trip status into message, dispute, compensation and admin alert', () => {
    const res = mapper.mapPostPaymentTripStatusNotBookable({ transactionId: 'txn_300', tripStatus: 'completed' });
    assert.deepEqual(res, {
      ok: false,
      statusCode: 400,
      body: {
        success: false,
        message: 'Your payment was received but the trip is no longer available (status: completed). Your case ID is txn_300. We will resolve this within 2 hours.',
        caseId: 'txn_300',
        errorCode: 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED',
      },
      disputeReason: 'Trip status is "completed" — not bookable after payment',
      compensationReason: 'Trip status "completed" not bookable',
      adminAlertReason: 'Trip status is "completed" — not bookable',
    });
  });
});
