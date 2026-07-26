'use strict';

/**
 * tests/unit/booking/passenger-esewa-verification-ownership.test.js
 * Static ownership assertions for passenger eSewa verification module boundary.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '../../../');
const controllerPath = path.join(rootDir, 'controllers/ticketController/paymentBookingController.js');
const moduleDir = path.join(rootDir, 'src/modules/booking/passenger-esewa-verification');

const controllerSource = fs.readFileSync(controllerPath, 'utf8');

const indexSource = fs.readFileSync(path.join(moduleDir, 'index.js'), 'utf8');
const serviceSource = fs.readFileSync(path.join(moduleDir, 'passenger-esewa-verification.service.js'), 'utf8');
const mapperSource = fs.readFileSync(path.join(moduleDir, 'passenger-esewa-verification.mapper.js'), 'utf8');
const combinedModuleSource = indexSource + '\n' + serviceSource + '\n' + mapperSource;

test('passengerEsewaVerificationOwnership static unit tests', async (t) => {
  await t.test('1. controller does NOT contain extracted eSewa implementation or strings', () => {
    const forbiddenInController = [
      'require("../../services/esewaVerificationService.js")',
      'verifyEsewaPayment(',
      'ESEWA_PARAMS_MISSING',
      'ESEWA_VERIFICATION_FAILED',
      'confirmBooking: eSewa verification failed',
      'confirmBooking: eSewa payment verified',
      'if (gateway === "esewa")',
    ];
    for (const str of forbiddenInController) {
      assert.ok(!controllerSource.includes(str), `controller does NOT contain ${str}`);
    }
  });

  await t.test('2. controller contains required orchestration symbols and result usage', () => {
    const requiredInController = [
      'verifyPassengerEsewaPayment',
      'esewaVerificationResult',
      '_reverseInternalMoneyDebitIfNeeded',
      'esewaVerificationResult.compensationReason',
    ];
    for (const str of requiredInController) {
      assert.ok(controllerSource.includes(str), `controller contains ${str}`);
    }
  });

  await t.test('3. new module owns eSewa domain implementation details and log strings', () => {
    const ownedByModule = [
      'verifyEsewaPayment',
      'ESEWA_PARAMS_MISSING',
      'ESEWA_VERIFICATION_FAILED',
      'confirmBooking: eSewa verification failed',
      'confirmBooking: eSewa payment verified',
      'Missing paymentId or paymentAmount for eSewa confirmation',
    ];
    for (const str of ownedByModule) {
      assert.ok(combinedModuleSource.includes(str), `module contains ${str}`);
    }
  });

  await t.test('4. new module does NOT contain unrelated logic or HTTP dependencies', () => {
    const forbiddenInModule = [
      'reverseDebit',
      'smLedgerService',
      'debitPassengerWalletPayment',
      'debitPassengerSplitPayment',
      'Transaction.create',
      'Booking.create',
      'res.status',
      'req.body',
    ];
    for (const str of forbiddenInModule) {
      assert.ok(!combinedModuleSource.includes(str), `module does NOT contain ${str}`);
    }
  });
});
