'use strict';

/**
 * tests/unit/booking/passenger-split-payment-ownership.test.js
 * Unit tests for passenger split-payment module boundary, ownership & call-site counts.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const moduleExports = require('../../../src/modules/booking/passenger-split-payment');

const rootDir = path.resolve(__dirname, '../../../');
const controllerPath = path.join(rootDir, 'controllers/ticketController/paymentBookingController.js');
const servicePath = path.join(rootDir, 'src/modules/booking/passenger-split-payment/passenger-split-payment.service.js');
const mapperPath = path.join(rootDir, 'src/modules/booking/passenger-split-payment/passenger-split-payment.mapper.js');

const controllerSource = fs.readFileSync(controllerPath, 'utf8');
const serviceSource = fs.readFileSync(servicePath, 'utf8');
const mapperSource = fs.readFileSync(mapperPath, 'utf8');
const combinedModuleSource = serviceSource + '\n' + mapperSource;

test('passengerSplitPaymentOwnership unit tests', async (t) => {

  await t.test('1. index exports ONLY debitPassengerSplitPayment and reversePassengerSplitPaymentDebit', () => {
    const keys = Object.keys(moduleExports).sort();
    assert.deepEqual(keys, ['debitPassengerSplitPayment', 'reversePassengerSplitPaymentDebit']);
    assert.equal(typeof moduleExports.debitPassengerSplitPayment, 'function');
    assert.equal(typeof moduleExports.reversePassengerSplitPaymentDebit, 'function');
    assert.equal(moduleExports.debitPassengerWalletPayment, undefined);
  });

  await t.test('2. controller contains required integrated symbols and helper names', () => {
    const requiredSymbols = [
      'debitPassengerSplitPayment',
      'reversePassengerSplitPaymentDebit',
      '_reverseInternalMoneyDebitIfNeeded',
      'walletDebitEntryId',
      'splitPaymentDebitEntryId',
      'internalMoneyDebitEntryId',
    ];
    for (const sym of requiredSymbols) {
      assert.ok(controllerSource.includes(sym), `controller contains ${sym}`);
    }
  });

  await t.test('3. controller does NOT contain extracted split-payment strings/logic', () => {
    const removedStrings = [
      'smMoneyApplied > 0 && gateway !== "wallet"',
      'SM Money spent at checkout',
      'SM_MONEY_DEBIT_FAILED',
      'SM Money FIFO debit failed',
      'SM Money debited (split payment)',
      '_reverseSmDebitIfNeeded',
    ];
    for (const str of removedStrings) {
      assert.ok(!controllerSource.includes(str), `controller does NOT contain ${str}`);
    }
  });

  await t.test('4. new module owns extracted split-payment domain strings', () => {
    const moduleStrings = [
      'SM Money spent at checkout',
      'SM_MONEY_DEBIT_FAILED',
      'SM Money FIFO debit failed',
      'SM Money debited (split payment)',
      'SM Money debit reversed',
      'CRITICAL — failed to reverse SM Money debit',
    ];
    for (const str of moduleStrings) {
      assert.ok(combinedModuleSource.includes(str), `module contains ${str}`);
    }
  });

  await t.test('5. static reversal call-site count matches dev (9 call sites, 0 lost)', () => {
    const devControllerSource = execSync('git show origin/dev:controllers/ticketController/paymentBookingController.js', { encoding: 'utf8' });
    const countInvocations = (source, name) => {
      const regex = new RegExp(name + '\\s*\\(', 'g');
      return (source.match(regex) || []).length;
    };

    const devCount = countInvocations(devControllerSource, '_reverseSmDebitIfNeeded');
    const branchCount = countInvocations(controllerSource, '_reverseInternalMoneyDebitIfNeeded');

    assert.equal(devCount, 9, 'origin/dev has 9 reversal call sites');
    assert.equal(branchCount, devCount, 'branch has identical reversal call sites to origin/dev');
    assert.equal(devCount - branchCount, 0, 'lost call sites is 0');
  });

  await t.test('6. old code cleanup proof (no dead files created)', () => {
    assert.ok(!controllerSource.includes('_reverseSmDebitIfNeeded'));
    assert.ok(!controllerSource.includes('smMoneyApplied > 0 && gateway !== "wallet"'));
    assert.ok(!controllerSource.includes('errorCode: "SM_MONEY_DEBIT_FAILED"'));
    assert.ok(!controllerSource.includes('SM Money spent at checkout'));
    assert.ok(fs.existsSync(controllerPath), 'controller exists');
    assert.ok(fs.existsSync(servicePath), 'service exists');
  });
});
