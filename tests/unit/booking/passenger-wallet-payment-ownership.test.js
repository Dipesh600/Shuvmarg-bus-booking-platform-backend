'use strict';

/**
 * tests/unit/booking/passenger-wallet-payment-ownership.test.js
 * Architectural ownership assertions for passenger wallet payment extraction.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const {
  readPassengerBookingConfirmationOrchestratorSource,
} = require('../../helpers/passenger-booking-confirmation-orchestrator-source');

const MODULE_DIR = path.resolve(
  __dirname,
  '../../../src/modules/booking/passenger-wallet-payment',
);

const controllerSrc = readPassengerBookingConfirmationOrchestratorSource();

const moduleRepoSrc = fs.readFileSync(path.join(MODULE_DIR, 'passenger-wallet-payment.repository.js'), 'utf8');
const moduleMapperSrc = fs.readFileSync(path.join(MODULE_DIR, 'passenger-wallet-payment.mapper.js'), 'utf8');
const moduleServiceSrc = fs.readFileSync(path.join(MODULE_DIR, 'passenger-wallet-payment.service.js'), 'utf8');

test('passenger wallet payment ownership tests', async (t) => {

  await t.test('controller contains debitPassengerWalletPayment', () => {
    assert.ok(controllerSrc.includes('debitPassengerWalletPayment'), 'Controller must import/call debitPassengerWalletPayment');
  });

  await t.test('controller does NOT contain extracted wallet strings', () => {
    const forbiddenStrings = [
      'Wallet.findOne({ userId })',
      'WALLET_NOT_AVAILABLE',
      'WALLET_FROZEN',
      'SM Wallet full payment',
      'WALLET_DEBIT_FAILED',
      'SM Wallet debit failed',
      'SM Wallet debited successfully',
    ];

    for (const str of forbiddenStrings) {
      assert.equal(
        controllerSrc.includes(str),
        false,
        `Controller must not contain "${str}" after extraction`,
      );
    }
  });

  await t.test('new module owns extracted wallet strings and operations', () => {
    assert.ok(moduleRepoSrc.includes('Wallet.findOne({ userId })'), 'Repository must own Wallet.findOne({ userId })');
    assert.ok(moduleMapperSrc.includes('WALLET_NOT_AVAILABLE'), 'Mapper must own WALLET_NOT_AVAILABLE');
    assert.ok(moduleMapperSrc.includes('WALLET_FROZEN'), 'Mapper must own WALLET_FROZEN');
    assert.ok(moduleMapperSrc.includes('WALLET_DEBIT_FAILED'), 'Mapper must own WALLET_DEBIT_FAILED');
    assert.ok(moduleServiceSrc.includes('SM Wallet full payment'), 'Service must own debit note text');
    assert.ok(moduleServiceSrc.includes('SM Wallet debited successfully'), 'Service must own success log');
    assert.ok(moduleServiceSrc.includes('SM Wallet debit failed'), 'Service must own failure log');
  });
});
