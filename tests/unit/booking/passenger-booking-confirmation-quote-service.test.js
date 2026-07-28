'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../../src/modules/booking/passenger-booking-confirmation-quote/passenger-booking-confirmation-quote.policy.js');
const mapper = require('../../../src/modules/booking/passenger-booking-confirmation-quote/passenger-booking-confirmation-quote.mapper.js');
const { createPassengerBookingConfirmationQuoteService } = require('../../../src/modules/booking/passenger-booking-confirmation-quote/passenger-booking-confirmation-quote.service.js');

test('passenger-booking-confirmation-quote service tests', async (t) => {
  const dummyLogger = { warn: () => {} };

  await t.test('1. no coupon skips coupon validation; positive SM money loads balance and config', async () => {
    let couponCalled = false; let balanceCalled = false; let configCalled = false;
    const couponHelper = { validateCoupon: async () => { couponCalled = true; } };
    const smLedgerService = { computeSpendableBalance: async () => { balanceCalled = true; return { display: 500 }; } };
    const platformConfig = { getConfig: async () => { configCalled = true; return { maxDiscountPercent: 80 }; } };

    const service = createPassengerBookingConfirmationQuoteService({
      couponHelper, smLedgerService, platformConfig, logger: dummyLogger, policy, mapper,
    });

    const res = await service.buildPassengerBookingConfirmationQuote({
      gateway: 'esewa', tempBookingId: 'BH123', paymentAmount: 800, originalAmount: 1000,
      couponCode: '', smMoneyToUse: 200, userId: 'u1', scheduleId: 's1', activeRole: 'passenger',
    });

    assert.equal(res.ok, true);
    assert.equal(couponCalled, false);
    assert.equal(balanceCalled, true);
    assert.equal(configCalled, true);
    assert.deepEqual(res.quote, {
      discountAmount: 0, finalAmount: 1000, couponUsed: null, appliedCouponCode: null,
      requestedSmMoney: 200, smMoneyApplied: 200, gatewayAmount: 800, expectedTotal: 1000,
    });
  });

  await t.test('2. zero SM Money skips balance/config lookup', async () => {
    let balanceCalled = false;
    const smLedgerService = { computeSpendableBalance: async () => { balanceCalled = true; return { display: 500 }; } };
    const platformConfig = { getConfig: async () => { throw new Error('Should not be called'); } };

    const service = createPassengerBookingConfirmationQuoteService({
      couponHelper: {}, smLedgerService, platformConfig, logger: dummyLogger, policy, mapper,
    });

    const res = await service.buildPassengerBookingConfirmationQuote({
      gateway: 'esewa', tempBookingId: 'BH123', paymentAmount: 1000, originalAmount: 1000,
      couponCode: null, smMoneyToUse: 0, userId: 'u1', scheduleId: 's1', activeRole: 'passenger',
    });

    assert.equal(res.ok, true);
    assert.equal(balanceCalled, false);
    assert.equal(res.quote.smMoneyApplied, 0);
    assert.equal(res.quote.gatewayAmount, 1000);
  });

  await t.test('3. direct balanceResult.display failure propagates (throws)', async () => {
    const smLedgerService = { computeSpendableBalance: async () => null };
    const platformConfig = { getConfig: async () => ({ maxDiscountPercent: 80 }) };

    const service = createPassengerBookingConfirmationQuoteService({
      couponHelper: {}, smLedgerService, platformConfig, logger: dummyLogger, policy, mapper,
    });

    await assert.rejects(
      async () => {
        await service.buildPassengerBookingConfirmationQuote({
          gateway: 'esewa', tempBookingId: 'BH123', paymentAmount: 800, originalAmount: 1000,
          couponCode: null, smMoneyToUse: 200, userId: 'u1', scheduleId: 's1', activeRole: 'passenger',
        });
      },
      TypeError
    );
  });

  await t.test('4. wallet quote overrides smMoneyApplied to paymentAmount and gatewayAmount to zero', async () => {
    const smLedgerService = { computeSpendableBalance: async () => ({ display: 1000 }) };
    const platformConfig = { getConfig: async () => ({ maxDiscountPercent: 80 }) };

    const service = createPassengerBookingConfirmationQuoteService({
      couponHelper: {}, smLedgerService, platformConfig, logger: dummyLogger, policy, mapper,
    });

    const res = await service.buildPassengerBookingConfirmationQuote({
      gateway: 'wallet', tempBookingId: 'BH123', paymentAmount: 1000, originalAmount: 1000,
      couponCode: null, smMoneyToUse: 0, userId: 'u1', scheduleId: 's1', activeRole: 'passenger',
    });

    assert.equal(res.ok, true);
    assert.equal(res.quote.smMoneyApplied, 1000);
    assert.equal(res.quote.gatewayAmount, 0);
  });

  await t.test('5. amount mismatch returns rejection response before any side effect', async () => {
    let warnLogged = false;
    const logger = { warn: () => { warnLogged = true; } };
    const couponHelper = {
      validateCoupon: async () => ({
        isValid: true, discountAmount: 100, finalAmount: 500, coupon: { _id: 'c1', couponCode: 'BUGGY' },
      }),
    };

    const service = createPassengerBookingConfirmationQuoteService({
      couponHelper, smLedgerService: {}, platformConfig: {}, logger, policy, mapper,
    });

    const res = await service.buildPassengerBookingConfirmationQuote({
      gateway: 'esewa', tempBookingId: 'BH123', paymentAmount: 500, originalAmount: 1000,
      couponCode: 'BUGGY', smMoneyToUse: 0, userId: 'u1', scheduleId: 's1', activeRole: 'passenger',
    });

    assert.equal(res.ok, false);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errorCode, 'AMOUNT_MISMATCH');
    assert.equal(warnLogged, true);
  });
});
