'use strict';
/**
 * tests/unit/booking/passenger-wallet-pin-removal.test.js
 * Asserts that the payment booking controller no longer contains runtime
 * wallet PIN dependencies after the removal refactor.
 */
const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const {
  readPassengerBookingConfirmationOrchestratorSource,
} = require('../../helpers/passenger-booking-confirmation-orchestrator-source');

const WALLET_MODULE = path.resolve(
  __dirname,
  '../../../src/modules/booking/passenger-wallet-payment',
);

const WALLET_MODEL = path.resolve(
  __dirname,
  '../../../models/walletModel.js',
);

const controllerSrc = readPassengerBookingConfirmationOrchestratorSource();

const moduleSrc = fs.readdirSync(WALLET_MODULE)
  .filter(f => f.endsWith('.js'))
  .map(f => fs.readFileSync(path.join(WALLET_MODULE, f), 'utf8'))
  .join('\n');

const allCode = controllerSrc + '\n' + moduleSrc;

test('payment booking flow: runtime wallet PIN removal', async (t) => {

  // ── Removed references ────────────────────────────────────────────────────
  await t.test('does not contain walletPin', () => {
    assert.equal(allCode.includes('walletPin'), false,
      'walletPin must not appear in controller or module');
  });

  await t.test('does not contain WALLET_PIN_REQUIRED', () => {
    assert.equal(allCode.includes('WALLET_PIN_REQUIRED'), false,
      'WALLET_PIN_REQUIRED must be removed');
  });

  await t.test('does not contain WALLET_PIN_NOT_SET', () => {
    assert.equal(allCode.includes('WALLET_PIN_NOT_SET'), false,
      'WALLET_PIN_NOT_SET must be removed');
  });

  await t.test('does not contain WALLET_PIN_INVALID', () => {
    assert.equal(allCode.includes('WALLET_PIN_INVALID'), false,
      'WALLET_PIN_INVALID must be removed');
  });

  await t.test('does not contain bcrypt.compare', () => {
    assert.equal(allCode.includes('bcrypt.compare'), false,
      'bcrypt.compare must be removed');
  });

  await t.test('does not require bcryptjs', () => {
    assert.equal(
      allCode.includes('require("bcryptjs")') || allCode.includes("require('bcryptjs')"),
      false,
      'bcryptjs require must be removed',
    );
  });

  await t.test('does not contain isPinSet', () => {
    assert.equal(allCode.includes('isPinSet'), false,
      'isPinSet must be removed');
  });

  // ── Preserved references ──────────────────────────────────────────────────
  await t.test('still contains Wallet.findOne({ userId })', () => {
    assert.ok(allCode.includes('Wallet.findOne({ userId })'),
      'Wallet ownership lookup must remain in system');
  });

  await t.test('still contains status !== "active"', () => {
    assert.ok(allCode.includes('status !== \'active\'') || allCode.includes('status !== "active"'),
      'Wallet status check must remain in system');
  });

  await t.test('still contains WALLET_NOT_AVAILABLE', () => {
    assert.ok(allCode.includes('WALLET_NOT_AVAILABLE'),
      'WALLET_NOT_AVAILABLE error code must be present in system');
  });

  await t.test('still contains WALLET_FROZEN', () => {
    assert.ok(allCode.includes('WALLET_FROZEN'),
      'WALLET_FROZEN error code must remain in system');
  });

  await t.test('still contains smLedgerService.debitLedgerFIFO', () => {
    assert.ok(allCode.includes('smLedgerService.debitLedgerFIFO'),
      'Ledger debit must remain in system');
  });

  // ── Schema deferred: wallet model must remain unchanged ───────────────────
  await t.test('wallet model still exists (schema retirement deferred)', () => {
    assert.ok(fs.existsSync(WALLET_MODEL), 'walletModel.js must still exist');
    const modelSrc = fs.readFileSync(WALLET_MODEL, 'utf8');
    assert.ok(modelSrc.length > 0, 'walletModel.js is non-empty');
  });
});
