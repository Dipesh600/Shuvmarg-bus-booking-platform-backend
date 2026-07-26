'use strict';

/**
 * tests/unit/booking/passenger-post-payment-trip-validation-ownership.test.js
 * Static ownership assertions for passenger post-payment trip validation module.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('passengerPostPaymentTripValidation ownership static tests', async (t) => {
  const controllerPath = path.join(
    __dirname,
    '../../../controllers/ticketController/paymentBookingController.js'
  );
  const controllerContent = fs.readFileSync(controllerPath, 'utf8');

  const moduleDir = path.join(
    __dirname,
    '../../../src/modules/booking/passenger-post-payment-trip-validation'
  );
  const moduleFiles = fs.readdirSync(moduleDir).map((f) => fs.readFileSync(path.join(moduleDir, f), 'utf8'));
  const moduleCombinedContent = moduleFiles.join('\n');

  await t.test('1. controller does NOT contain extracted trip lookup or inline validation logic/strings', () => {
    const forbiddenStrings = [
      'require("../../models/tripModel.js")',
      'Trip.findById(scheduleId).lean()',
      'trip.bookingClosesAt',
      'trip.status !== "scheduled"',
      'trip.status !== "boarding"',
      'Trip not found after payment verification',
      'Booking window closed after payment was processed',
      'not bookable after payment',
    ];
    for (const str of forbiddenStrings) {
      assert.equal(
        controllerContent.includes(str),
        false,
        `Controller should not contain '${str}'`
      );
    }
  });

  await t.test('2. controller contains required orchestration symbols and result usage', () => {
    const requiredSymbols = [
      'validatePassengerPostPaymentTrip',
      'postPaymentTripResult',
      'postPaymentTripResult.disputeReason',
      'postPaymentTripResult.compensationReason',
      'postPaymentTripResult.adminAlertReason',
      'postPaymentTripResult.statusCode',
      'postPaymentTripResult.body',
      'postPaymentTripResult.trip',
      'Transaction.findByIdAndUpdate',
      '_reverseInternalMoneyDebitIfNeeded',
      '_sendDisputeAdminAlert',
    ];
    for (const sym of requiredSymbols) {
      assert.equal(
        controllerContent.includes(sym),
        true,
        `Controller must contain '${sym}'`
      );
    }
  });

  await t.test('3. new module owns trip validation domain details and log/reason strings', () => {
    const requiredModuleStrings = [
      'Trip.findById',
      'bookingClosesAt',
      'scheduled',
      'boarding',
      'Trip not found after payment verification',
      'Booking window closed after payment was processed',
      'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED',
      'not bookable after payment',
    ];
    for (const str of requiredModuleStrings) {
      assert.equal(
        moduleCombinedContent.includes(str),
        true,
        `Module combined content must contain '${str}'`
      );
    }
  });

  await t.test('4. new module does NOT contain unrelated side effects or HTTP dependencies', () => {
    const forbiddenModuleStrings = [
      'Transaction.findByIdAndUpdate',
      '_reverseInternalMoneyDebitIfNeeded',
      '_sendDisputeAdminAlert',
      'Seat.findOne',
      'Booking.create',
      'res.status',
      'req.body',
      'DISPUTED',
      'SUCCESS',
    ];
    for (const str of forbiddenModuleStrings) {
      assert.equal(
        moduleCombinedContent.includes(str),
        false,
        `Module should not contain '${str}'`
      );
    }
  });
});
