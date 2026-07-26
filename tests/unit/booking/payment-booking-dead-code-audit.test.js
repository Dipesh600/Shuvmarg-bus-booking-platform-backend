'use strict';

/**
 * tests/unit/booking/payment-booking-dead-code-audit.test.js
 * Unit tests for payment-booking controller dead code audit & module ownership.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');

const controllerPath   = path.resolve(__dirname, '../../../controllers/ticketController/paymentBookingController.js');
const controllerSource = fs.readFileSync(controllerPath, 'utf8');

test('paymentBookingDeadCodeAudit unit tests', async (t) => {

  await t.test('1. controller does NOT contain removed dead imports', () => {
    assert.ok(!controllerSource.includes('require("../../models/userModel.js")'), 'User model import removed');
    assert.ok(!controllerSource.includes('require("../../models/seatHoldModel.js")'), 'SeatHold model import removed');
  });

  await t.test('2. controller does NOT bind removed dead locals', () => {
    assert.ok(!controllerSource.includes('scheduleId: clientScheduleId'), 'clientScheduleId not bound');
    assert.ok(!controllerSource.includes('seatNumbers: clientSeats'), 'clientSeats not bound');
    assert.ok(!controllerSource.includes('requestedSmMoney,'), 'requestedSmMoney not bound');
  });

  await t.test('3. controller retains required orchestration and authoritative references', () => {
    const requiredReferences = [
      'req.bookingHold.tripId',
      'req.bookingHold.seatNumbers',
      'smMoneyApplied',
      'gatewayAmount',
      'debitPassengerWalletPayment',
      'debitPassengerSplitPayment',
      'reversePassengerSplitPaymentDebit',
      'verifyEsewaPayment',
      'Transaction.create',
      'Booking.create',
      '_rollbackSeatLocks',
      '_sendDisputeAdminAlert',
      '_reverseInternalMoneyDebitIfNeeded',
    ];
    for (const ref of requiredReferences) {
      assert.ok(controllerSource.includes(ref), `controller retains ${ref}`);
    }
  });

  await t.test('4. controller does NOT contain inline module domain implementation details', () => {
    const extractedStrings = [
      'SM Wallet debited successfully (full payment)',
      'SM Money spent at checkout',
      'SM_MONEY_DEBIT_FAILED',
      '_reverseSmDebitIfNeeded',
    ];
    for (const str of extractedStrings) {
      assert.ok(!controllerSource.includes(str), `controller does NOT contain ${str}`);
    }
  });

  await t.test('5. confirmation, wallet, and split operations are invoked via modular boundaries', () => {
    assert.ok(controllerSource.includes('buildPassengerBookingConfirmationQuote({'), 'buildPassengerBookingConfirmationQuote invoked');
    assert.ok(controllerSource.includes('debitPassengerWalletPayment({'), 'debitPassengerWalletPayment invoked');
    assert.ok(controllerSource.includes('debitPassengerSplitPayment({'), 'debitPassengerSplitPayment invoked');
    assert.ok(controllerSource.includes('reversePassengerSplitPaymentDebit({'), 'reversePassengerSplitPaymentDebit invoked');
  });
});
