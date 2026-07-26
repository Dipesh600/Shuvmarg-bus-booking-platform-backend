'use strict';

/**
 * tests/unit/booking/passenger-transaction-success-reconciliation-ownership.test.js
 * Static ownership assertions for passenger transaction success reconciliation.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const controllerPath = path.join(
  __dirname,
  '../../../controllers/ticketController/paymentBookingController.js'
);
const moduleDirPath = path.join(
  __dirname,
  '../../../src/modules/booking/passenger-transaction-success-reconciliation'
);

test('passengerTransactionSuccessReconciliation ownership static tests', async (t) => {
  const controllerContent = fs.readFileSync(controllerPath, 'utf8');

  await t.test('1. controller STEP 9 block does NOT contain direct findOneAndUpdate status update strings', () => {
    const step9Match = controllerContent.match(
      /\/\/ STEP 9: TRANSITION TRANSACTION TO SUCCESS WITH VERIFICATION[\s\S]*?\/\/ Capture all response fields/
    );
    assert.ok(step9Match, 'STEP 9 block must be present');
    const step9Content = step9Match[0];

    assert.equal(step9Content.includes('Transaction.findOneAndUpdate('), false);
    assert.equal(step9Content.includes('status: "PAYMENT_RECEIVED"'), false);
    assert.equal(step9Content.includes('status: "SUCCESS"'), false);
    assert.equal(step9Content.includes('runValidators: true'), false);
  });

  await t.test('2. controller contains required orchestration symbols and log/response tokens', () => {
    assert.ok(controllerContent.includes('reconcilePassengerTransactionSuccess'));
    assert.ok(controllerContent.includes('reconciliationResult'));
    assert.ok(controllerContent.includes('reconciliationResult.ok'));
    assert.ok(controllerContent.includes('Transaction SUCCESS transition failed (returned null)'));
    assert.ok(controllerContent.includes('Transaction SUCCESS transition threw exception'));
    assert.ok(controllerContent.includes('BOOKING_RECONCILIATION_REQUIRED'));
    assert.ok(controllerContent.includes('buildCommittedBookingResponse'));
    assert.ok(controllerContent.includes('bookingCommitted = true'));
  });

  await t.test('3. new module owns domain details, filters, updates, options, and failure types', () => {
    const moduleFiles = fs.readdirSync(moduleDirPath).filter((f) => f.endsWith('.js'));
    const combinedModuleContent = moduleFiles
      .map((f) => fs.readFileSync(path.join(moduleDirPath, f), 'utf8'))
      .join('\n');

    assert.ok(combinedModuleContent.includes('Transaction.findOneAndUpdate'));
    assert.ok(combinedModuleContent.includes('PAYMENT_RECEIVED'));
    assert.ok(combinedModuleContent.includes('SUCCESS'));
    assert.ok(combinedModuleContent.includes('bookingId'));
    assert.ok(combinedModuleContent.includes('ticketId'));
    assert.ok(combinedModuleContent.includes('new: true'));
    assert.ok(combinedModuleContent.includes('runValidators: true'));
    assert.ok(combinedModuleContent.includes('RECONCILIATION_UPDATE_NOT_APPLIED'));
  });

  await t.test('4. new module does NOT contain controller concerns or side effects', () => {
    const moduleFiles = fs.readdirSync(moduleDirPath).filter((f) => f.endsWith('.js'));
    const combinedModuleContent = moduleFiles
      .map((f) => fs.readFileSync(path.join(moduleDirPath, f), 'utf8'))
      .join('\n');

    const forbidden = [
      'logger.',
      'res.status',
      'req.body',
      '_rollbackSeatLocks',
      '_reverseInternalMoneyDebitIfNeeded',
      '_sendDisputeAdminAlert',
      'DISPUTED',
      'BOOKING_RECONCILIATION_REQUIRED',
      'buildCommittedBookingResponse',
      'bookingCommitted',
      'Booking.create',
      'completePassengerHold',
    ];

    for (const token of forbidden) {
      assert.equal(
        combinedModuleContent.includes(token),
        false,
        `Module must not contain ${token}`
      );
    }
  });
});
