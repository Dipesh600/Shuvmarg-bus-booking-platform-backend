'use strict';

/**
 * tests/unit/booking/passenger-seat-commitment-ownership.test.js
 * Static ownership tests for passenger seat commitment module.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('passengerSeatCommitment ownership static tests', async (t) => {
  const controllerPath = path.join(
    __dirname,
    '../../../controllers/ticketController/paymentBookingController.js'
  );
  const controllerContent = fs.readFileSync(controllerPath, 'utf8');

  const moduleDir = path.join(
    __dirname,
    '../../../src/modules/booking/passenger-seat-commitment'
  );
  const moduleFiles = fs.readdirSync(moduleDir).map((f) =>
    fs.readFileSync(path.join(moduleDir, f), 'utf8')
  );
  const moduleCombinedContent = moduleFiles.join('\n');

  await t.test('1. controller confirmBooking does NOT contain inline seat commitment logic/strings', () => {
    const confirmBookingSource = controllerContent.slice(
      controllerContent.indexOf('const confirmBooking')
    );
    const forbiddenInConfirmBooking = [
      'Seat.findOne({ tripId: scheduleId })',
      'Seat.findOneAndUpdate',
      'const allSeats =',
      'const exactSeatsToLock =',
      'const alreadyBookedSeats =',
      'const invalidSeats =',
      'Seat data not found for trip after payment',
      'Seat lock failed after payment:',
    ];
    for (const str of forbiddenInConfirmBooking) {
      assert.equal(
        confirmBookingSource.includes(str),
        false,
        `confirmBooking must not contain '${str}'`
      );
    }
  });

  await t.test('2. controller contains required orchestration symbols and side effects', () => {
    const requiredInController = [
      'commitPassengerSeats',
      'seatCommitmentResult',
      'seatCommitmentResult.rollbackRequired',
      'seatCommitmentResult.disputeReason',
      'seatCommitmentResult.compensationReason',
      'seatCommitmentResult.adminAlertReason',
      'seatCommitmentResult.statusCode',
      'seatCommitmentResult.body',
      'seatCommitmentResult.lockedSeatNumbers',
      '_rollbackSeatLocks',
      'Transaction.findByIdAndUpdate',
    ];
    for (const str of requiredInController) {
      assert.equal(
        controllerContent.includes(str),
        true,
        `Controller must contain '${str}'`
      );
    }
  });

  await t.test('3. new module owns seat commitment domain details and response/log strings', () => {
    const requiredInModule = [
      'Seat.findOne',
      'Seat.findOneAndUpdate',
      'seata',
      'seatb',
      'seatc',
      'exactSeatsToLock',
      'invalidSeats',
      'alreadyBookedSeats',
      'SEAT_DATA_NOT_FOUND',
      'SEAT_LOCK_FAILED',
      'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED',
    ];
    for (const str of requiredInModule) {
      assert.equal(
        moduleCombinedContent.includes(str),
        true,
        `Module must contain '${str}'`
      );
    }
  });

  await t.test('4. new module does NOT contain controller side effects or HTTP handling', () => {
    const forbiddenInModule = [
      'Transaction.findByIdAndUpdate',
      '_reverseInternalMoneyDebitIfNeeded',
      '_sendDisputeAdminAlert',
      '_rollbackSeatLocks',
      'Booking.create',
      'res.status',
      'req.body',
      'SUCCESS',
    ];
    for (const str of forbiddenInModule) {
      assert.equal(
        moduleCombinedContent.includes(str),
        false,
        `Module must not contain '${str}'`
      );
    }
  });
});
