'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../../src/modules/booking/passenger-booking-confirmation-quote/passenger-booking-confirmation-quote.policy.js');

test('passenger-booking-confirmation-quote policy tests', async (t) => {
  await t.test('1. gateway validation', () => {
    assert.equal(policy.validateConfirmationGateway('esewa').isValid, true);
    assert.equal(policy.validateConfirmationGateway('wallet').isValid, true);
    const unsupp = policy.validateConfirmationGateway('khalti');
    assert.equal(unsupp.isValid, false);
    assert.equal(unsupp.statusCode, 400);
    assert.equal(unsupp.responseBody.errorCode, 'UNSUPPORTED_PAYMENT_GATEWAY');
  });

  await t.test('2. reference validation', () => {
    assert.equal(policy.validateConfirmationReference('BH123').isValid, true);
    const missing = policy.validateConfirmationReference(null);
    assert.equal(missing.isValid, false);
    assert.equal(missing.statusCode, 400);
    assert.equal(missing.responseBody.message, 'Missing required fields for booking confirmation');
  });

  await t.test('3. requested SM Money normalization', () => {
    assert.equal(policy.normalizeRequestedSmMoney(-50), 0);
    assert.equal(policy.normalizeRequestedSmMoney(49.9), 49);
    assert.equal(policy.normalizeRequestedSmMoney('abc'), 0);
    assert.equal(policy.normalizeRequestedSmMoney(100), 100);
  });

  await t.test('4. eSewa quote calculations', () => {
    const q = policy.calculateConfirmationQuote({
      gateway: 'esewa',
      originalAmount: 1000,
      discountAmount: 200,
      paymentAmount: 800,
      requestedSmMoney: 300,
      spendableBalance: 500,
      maxDiscountPercent: 80,
    });
    // maxTotalDiscount = 800, maxSmMoneyAllowed = 600
    assert.equal(q.smMoneyApplied, 300);
    assert.equal(q.gatewayAmount, 500); // (1000 - 200) - 300
  });

  await t.test('5. wallet quote calculations', () => {
    const q = policy.calculateConfirmationQuote({
      gateway: 'wallet',
      originalAmount: 1000,
      discountAmount: 200,
      paymentAmount: 800,
      requestedSmMoney: 0,
      spendableBalance: 1000,
      maxDiscountPercent: 80,
    });
    assert.equal(q.smMoneyApplied, 800);
    assert.equal(q.gatewayAmount, 0);
  });

  await t.test('6. balance and discount caps for SM money', () => {
    // spendable balance cap
    const q1 = policy.calculateConfirmationQuote({
      gateway: 'esewa',
      originalAmount: 1000,
      discountAmount: 0,
      paymentAmount: 1000,
      requestedSmMoney: 500,
      spendableBalance: 200,
      maxDiscountPercent: 80,
    });
    assert.equal(q1.smMoneyApplied, 200);

    // combined discount cap (80% max discount = 800. Coupon = 700. Max SM Money = 100)
    const q2 = policy.calculateConfirmationQuote({
      gateway: 'esewa',
      originalAmount: 1000,
      discountAmount: 700,
      paymentAmount: 300,
      requestedSmMoney: 300,
      spendableBalance: 500,
      maxDiscountPercent: 80,
    });
    assert.equal(q2.smMoneyApplied, 100);
  });

  await t.test('7. amount consistency validation', () => {
    assert.equal(policy.validateConfirmationAmount({ finalAmount: 1000, gatewayAmount: 700, smMoneyApplied: 300 }).isValid, true);
    // Difference of 1 is accepted
    assert.equal(policy.validateConfirmationAmount({ finalAmount: 1000, gatewayAmount: 701, smMoneyApplied: 300 }).isValid, true);
    // Difference > 1 rejected
    const res = policy.validateConfirmationAmount({ finalAmount: 1000, gatewayAmount: 702, smMoneyApplied: 300 });
    assert.equal(res.isValid, false);
    assert.equal(res.statusCode, 400);
    assert.equal(res.responseBody.errorCode, 'AMOUNT_MISMATCH');
  });

  await t.test('8. validatePassengerBookingConfirmationRequest', () => {
    assert.deepEqual(policy.validatePassengerBookingConfirmationRequest({ gateway: 'esewa', tempBookingId: 'TB1' }), { ok: true });
    const invalidGw = policy.validatePassengerBookingConfirmationRequest({ gateway: 'invalid', tempBookingId: 'TB1' });
    assert.equal(invalidGw.ok, false);
    assert.equal(invalidGw.statusCode, 400);
    assert.equal(invalidGw.body.errorCode, 'UNSUPPORTED_PAYMENT_GATEWAY');

    const missingRef = policy.validatePassengerBookingConfirmationRequest({ gateway: 'esewa', tempBookingId: null });
    assert.equal(missingRef.ok, false);
    assert.equal(missingRef.statusCode, 400);
    assert.equal(missingRef.body.message, 'Missing required fields for booking confirmation');
  });
});
