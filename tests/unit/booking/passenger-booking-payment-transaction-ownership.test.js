'use strict';

/**
 * tests/unit/booking/passenger-booking-payment-transaction-ownership.test.js
 * Static ownership assertions for passenger booking payment transaction module.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('passengerBookingPaymentTransaction ownership static tests', async (t) => {
  const controllerPath = path.join(
    __dirname,
    '../../../controllers/ticketController/paymentBookingController.js'
  );
  const controllerContent = fs.readFileSync(controllerPath, 'utf8');

  const moduleDir = path.join(
    __dirname,
    '../../../src/modules/booking/passenger-booking-payment-transaction'
  );
  const moduleFiles = fs.readdirSync(moduleDir).map((f) => fs.readFileSync(path.join(moduleDir, f), 'utf8'));
  const moduleCombinedContent = moduleFiles.join('\n');

  await t.test('1. controller does NOT contain extracted transaction creation strings or implementation', () => {
    const forbiddenStrings = [
      'PlatformConfig.getConfig("gateway_fees")',
      'Transaction.create({',
      'confirmBooking: Transaction record created (PAYMENT_RECEIVED)',
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
      'createPassengerBookingPaymentTransaction',
      'paymentTransactionResult',
      'paymentTransactionResult.transaction',
      'paymentTransactionResult.gatewayFeeRate',
      'Transaction.findByIdAndUpdate',
    ];
    for (const sym of requiredSymbols) {
      assert.equal(
        controllerContent.includes(sym),
        true,
        `Controller must contain '${sym}'`
      );
    }
  });

  await t.test('3. new module owns payment transaction domain details', () => {
    const requiredModuleStrings = [
      'gateway_fees',
      'PAYMENT_RECEIVED',
      'transactionType',
      'BOOKING',
      'SM_WALLET',
      'sm_wallet_',
      'smDebitEntryId',
      'gatewayFeeRate',
      'confirmBooking: Transaction record created (PAYMENT_RECEIVED)',
    ];
    for (const str of requiredModuleStrings) {
      assert.equal(
        moduleCombinedContent.includes(str),
        true,
        `Module combined content must contain '${str}'`
      );
    }
  });

  await t.test('4. new module does NOT contain unrelated logic or HTTP dependencies', () => {
    const forbiddenModuleStrings = [
      'Transaction.findByIdAndUpdate',
      'DISPUTED',
      'SUCCESS',
      'Booking.create',
      'Seat.findOne',
      'reverseDebit',
      'res.status',
      'req.body',
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
