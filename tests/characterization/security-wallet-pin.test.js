'use strict';
process.env.NODE_ENV = 'test';
const { test, before, beforeEach, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const db = require('../helpers/db');
const Wallet = require('../../models/walletModel');
const { Counter } = require('../../src/shared/http/mongo-rate-limit-store');
const pin = require('../../src/modules/wallet/payment-authorization/wallet-pin.service');
const { createPassengerBookingConfirmationPaymentStage } = require('../../src/modules/booking/passenger-booking-confirmation-orchestrator/passenger-booking-confirmation-payment-stage.service');
let userId;
before(async () => { await db.connect(); await Counter.init(); });
beforeEach(async () => {
  await db.clearAll(); userId = new mongoose.Types.ObjectId();
  await Wallet.create({ userId, pin: await bcrypt.hash('1234', 4), isPinSet: true, status: 'active' });
});
after(async () => { mock.restoreAll(); await db.disconnect(); });
test.afterEach(() => mock.restoreAll());
test('twenty simultaneous guesses can run at most five PIN comparisons', async () => {
  const compare = bcrypt.compare; let comparisons = 0;
  mock.method(bcrypt, 'compare', (...args) => { comparisons++; return compare(...args); });
  const results = await Promise.all(Array.from({ length: 20 }, () => pin.verifyPaymentPin({ userId, pin: '9999' })));
  assert.equal(comparisons, 5);
  assert.equal(results.filter(result => result.statusCode === 429).length, 15);
  assert.equal((await pin.verifyPaymentPin({ userId, pin: '1234' })).statusCode, 429);
});
test('correct PIN attempts do not exhaust the failed-attempt budget', async () => {
  for (let i = 0; i < 8; i++) assert.equal((await pin.verifyPaymentPin({ userId, pin: '1234' })).ok, true);
});
test('a frozen wallet cannot authorize a payment even with the correct PIN', async () => {
  await Wallet.updateOne({ userId }, { $set: { status: 'frozen' } });
  assert.equal((await pin.verifyPaymentPin({ userId, pin: '1234' })).statusCode, 403);
});
for (const gateway of ['wallet', 'esewa']) {
  test(`${gateway} confirmation requires PIN on the actual money request`, async () => {
    const stage = createPassengerBookingConfirmationPaymentStage({
      validatePassengerBookingConfirmationRequest: () => ({ ok: true }),
      buildPassengerBookingConfirmationQuote: async () => ({ ok: true, quote: { smMoneyApplied: 300 } }),
      claimPassengerHoldForConfirmation: async () => assert.fail('claim or money movement before authorization'),
    });
    const req = { body: { gateway, tempBookingId: 'hold', smMoneyToUse: 300 },
      dbUser: { _id: userId }, userInfo: { activeRole: 'passenger' },
      bookingHold: { _id: 'hold', tripId: 'trip', originalAmount: 1000, seatNumbers: ['A1'] } };
    assert.equal((await pin.verifyPaymentPin({ userId, pin: '1234' })).ok, true);
    // Prior verify-pin success creates no permission to debit without a PIN.
    assert.equal((await stage({ req, state: {} })).body.errorCode, 'WALLET_PIN_REQUIRED');
    req.body.walletPin = '9999';
    assert.equal((await stage({ req, state: {} })).body.errorCode, 'WALLET_PIN_INCORRECT');
  });
}

for (const gateway of ['wallet', 'esewa']) {
  test(`${gateway}: correct request PIN permits the authorized payment stage`, async () => {
    let debit = 0;
    const stage = createPassengerBookingConfirmationPaymentStage({
      validatePassengerBookingConfirmationRequest: () => ({ ok: true }),
      buildPassengerBookingConfirmationQuote: async () => ({ ok: true, quote: { smMoneyApplied: 300, gatewayAmount: 700 } }),
      claimPassengerHoldForConfirmation: async () => true,
      debitPassengerSplitPayment: async ({ gateway: selected }) => {
        if (selected !== 'wallet') debit++;
        return { ok: true, debitEntryId: selected === 'wallet' ? null : 'split' };
      },
      verifyPassengerEsewaPayment: async () => ({ ok: true }),
      debitPassengerWalletPayment: async () => { debit++; return { ok: true, debitEntryId: 'wallet' }; },
      createPassengerBookingPaymentTransaction: async () => ({ transaction: { _id: 'txn' }, gatewayFeeRate: 0 }),
    });
    const req = { body: { gateway, walletPin: '1234' }, dbUser: { _id: userId },
      userInfo: { activeRole: 'passenger' }, bookingHold: { _id: 'hold', tripId: 'trip' } };
    assert.equal(await stage({ req, state: {} }), null);
    assert.equal(debit, 1);
  });
}
