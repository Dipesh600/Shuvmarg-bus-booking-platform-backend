'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../../src/modules/booking/passenger-booking-confirmation-quote/passenger-booking-confirmation-quote.policy.js');
const mapper = require('../../../src/modules/booking/passenger-booking-confirmation-quote/passenger-booking-confirmation-quote.mapper.js');
const { createPassengerBookingConfirmationQuoteService } = require('../../../src/modules/booking/passenger-booking-confirmation-quote/passenger-booking-confirmation-quote.service.js');

test('passenger-booking-confirmation-quote coupon integration tests', async (t) => {
  const dummyLogger = { warn: () => {} };

  await t.test('1. supplied coupon calls couponHelper with exact arguments', async () => {
    let capturedArgs = null;
    const couponHelper = {
      validateCoupon: async (couponCode, userId, originalAmount, scheduleId, activeRole) => {
        capturedArgs = { couponCode, userId, originalAmount, scheduleId, activeRole };
        return {
          isValid: true,
          discountAmount: 100,
          finalAmount: 900,
          coupon: { _id: 'c123', couponCode: 'SAVE100' },
        };
      },
    };

    const service = createPassengerBookingConfirmationQuoteService({
      couponHelper,
      smLedgerService: {},
      platformConfig: {},
      logger: dummyLogger,
      policy,
      mapper,
    });

    const res = await service.buildPassengerBookingConfirmationQuote({
      gateway: 'esewa',
      tempBookingId: 'BH123',
      paymentAmount: 900,
      originalAmount: 1000,
      couponCode: '  SAVE100  ',
      smMoneyToUse: 0,
      userId: 'user1',
      scheduleId: 'sched1',
      activeRole: 'passenger',
    });

    assert.equal(res.ok, true);
    assert.deepEqual(capturedArgs, {
      couponCode: '  SAVE100  ',
      userId: 'user1',
      originalAmount: 1000,
      scheduleId: 'sched1',
      activeRole: 'passenger',
    });
    assert.equal(res.quote.discountAmount, 100);
    assert.equal(res.quote.finalAmount, 900);
    assert.equal(res.quote.couponUsed, 'c123');
    assert.equal(res.quote.appliedCouponCode, 'SAVE100');
  });

  await t.test('2. invalid coupon returns exact error response without proceeding', async () => {
    let balanceCalled = false;
    const couponHelper = {
      validateCoupon: async () => ({
        isValid: false,
        error: 'Coupon expired',
      }),
    };
    const smLedgerService = {
      computeSpendableBalance: async () => { balanceCalled = true; return { display: 500 }; },
    };

    const service = createPassengerBookingConfirmationQuoteService({
      couponHelper,
      smLedgerService,
      platformConfig: {},
      logger: dummyLogger,
      policy,
      mapper,
    });

    const res = await service.buildPassengerBookingConfirmationQuote({
      gateway: 'esewa',
      tempBookingId: 'BH123',
      paymentAmount: 900,
      originalAmount: 1000,
      couponCode: 'EXPIRED',
      smMoneyToUse: 100,
      userId: 'user1',
      scheduleId: 'sched1',
      activeRole: 'passenger',
    });

    assert.equal(res.ok, false);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Coupon validation failed: Coupon expired');
    assert.equal(res.body.errorCode, 'COUPON_INVALID_DURING_CONFIRMATION');
    assert.equal(balanceCalled, false);
  });
});
