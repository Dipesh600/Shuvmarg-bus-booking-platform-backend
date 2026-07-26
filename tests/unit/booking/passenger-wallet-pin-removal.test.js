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

const CONTROLLER = path.resolve(
  __dirname,
  '../../../controllers/ticketController/paymentBookingController.js',
);

const WALLET_MODEL = path.resolve(
  __dirname,
  '../../../models/walletModel.js',
);

const src = fs.readFileSync(CONTROLLER, 'utf8');

test('paymentBookingController: runtime wallet PIN removal', async (t) => {

  // ── Removed references ────────────────────────────────────────────────────
  await t.test('does not contain walletPin', () => {
    assert.equal(src.includes('walletPin'), false,
      'walletPin must not appear in controller');
  });

  await t.test('does not contain WALLET_PIN_REQUIRED', () => {
    assert.equal(src.includes('WALLET_PIN_REQUIRED'), false,
      'WALLET_PIN_REQUIRED must be removed');
  });

  await t.test('does not contain WALLET_PIN_NOT_SET', () => {
    assert.equal(src.includes('WALLET_PIN_NOT_SET'), false,
      'WALLET_PIN_NOT_SET must be removed');
  });

  await t.test('does not contain WALLET_PIN_INVALID', () => {
    assert.equal(src.includes('WALLET_PIN_INVALID'), false,
      'WALLET_PIN_INVALID must be removed');
  });

  await t.test('does not contain bcrypt.compare', () => {
    assert.equal(src.includes('bcrypt.compare'), false,
      'bcrypt.compare must be removed from controller');
  });

  await t.test('does not require bcryptjs', () => {
    assert.equal(
      src.includes('require("bcryptjs")') || src.includes("require('bcryptjs')"),
      false,
      'bcryptjs require must be removed from controller',
    );
  });

  await t.test('does not contain isPinSet', () => {
    assert.equal(src.includes('isPinSet'), false,
      'isPinSet must be removed from controller');
  });

  // ── Preserved references ──────────────────────────────────────────────────
  await t.test('still contains Wallet.findOne({ userId })', () => {
    assert.ok(src.includes('Wallet.findOne({ userId })'),
      'Wallet ownership lookup must remain');
  });

  await t.test('still contains userWallet.status !== "active"', () => {
    assert.ok(src.includes('userWallet.status !== "active"'),
      'Wallet status check must remain');
  });

  await t.test('still contains WALLET_NOT_AVAILABLE', () => {
    assert.ok(src.includes('WALLET_NOT_AVAILABLE'),
      'WALLET_NOT_AVAILABLE error code must be present');
  });

  await t.test('still contains WALLET_FROZEN', () => {
    assert.ok(src.includes('WALLET_FROZEN'),
      'WALLET_FROZEN error code must remain');
  });

  await t.test('still contains smLedgerService.debitLedgerFIFO', () => {
    assert.ok(src.includes('smLedgerService.debitLedgerFIFO'),
      'Ledger debit must remain');
  });

  // ── Schema deferred: wallet model must remain unchanged ───────────────────
  await t.test('wallet model still exists (schema retirement deferred)', () => {
    assert.ok(fs.existsSync(WALLET_MODEL), 'walletModel.js must still exist');
    const modelSrc = fs.readFileSync(WALLET_MODEL, 'utf8');
    // We only assert existence; we do NOT require schema fields to be absent.
    assert.ok(modelSrc.length > 0, 'walletModel.js is non-empty');
  });
});
