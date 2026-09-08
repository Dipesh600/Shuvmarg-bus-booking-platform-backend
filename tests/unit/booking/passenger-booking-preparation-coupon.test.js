const test = require('node:test');
const assert = require('node:assert/strict');
const { createPassengerBookingPreparationService } = require('../../../src/modules/booking/passenger-booking-preparation/passenger-booking-preparation.service.js');
const policy = require('../../../src/modules/booking/passenger-booking-preparation/passenger-booking-preparation.policy.js');
const mapper = require('../../../src/modules/booking/passenger-booking-preparation/passenger-booking-preparation.mapper.js');

test('passenger-booking-preparation coupon tests', async (t) => {
  const fakeTrip = { _id: 't1', status: 'scheduled', tripFare: 1000 };
  const fakeSeatDoc = { seata: [{ seatNo: 'A1', booked: false }], seatb: [], seatc: [] };

  await t.test('1. coupon validation receives exact arguments when supplied', async () => {
    let validateCouponArgs = null;

    const service = createPassengerBookingPreparationService({
      repository: {
        findBookableTripContext: async () => fakeTrip,
        findTripSeatDocument: async () => fakeSeatDoc,
      },
      couponHelper: {
        validateCoupon: async (couponCode, userId, originalAmount, scheduleId, activeRole) => {
          validateCouponArgs = { couponCode, userId, originalAmount, scheduleId, activeRole };
          return {
            isValid: true,
            discountAmount: 200,
            coupon: { _id: 'c1', couponCode: 'SAVE200', title: 'Save 200', discountType: 'FLAT', discountValue: 200 },
          };
        },
      },
      smLedgerService: { computePurchaseBalance: async () => ({ display: 0, refund: 0, restricted: 0 }) },
      platformConfig: { getConfig: async () => null },
      passengerSeatHold: {
        normalizeSeatNumbers: (seats) => seats.map((s) => s.toLowerCase()),
        createOrReusePassengerSeatHold: async () => ({ tempBookingId: 'tmp-1', seatNumbers: ['a1'], expiresAt: '2026-07-25T12:10:00Z' }),
      },
      policy,
      mapper,
    });

    const res = await service.preparePassengerBooking({
      scheduleId: 't1',
      seatNumbers: ['A1'],
      originalAmount: 1000,
      couponCode: 'SAVE200',
      userId: 'u1',
      activeRole: 'passenger',
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(validateCouponArgs, {
      couponCode: 'SAVE200',
      userId: 'u1',
      originalAmount: 1000,
      scheduleId: 't1',
      activeRole: 'passenger',
    });
    assert.equal(res.body.data.couponDiscount, 200);
    assert.equal(res.body.data.couponDetails.couponCode, 'SAVE200');
  });

  await t.test('2. invalid coupon stops the flow with 400', async () => {
    let holdCalled = false;

    const service = createPassengerBookingPreparationService({
      repository: {
        findBookableTripContext: async () => fakeTrip,
        findTripSeatDocument: async () => fakeSeatDoc,
      },
      couponHelper: {
        validateCoupon: async () => ({
          isValid: false,
          error: 'Coupon expired',
          errorCode: 'COUPON_EXPIRED',
        }),
      },
      smLedgerService: { computePurchaseBalance: async () => ({ display: 0, refund: 0, restricted: 0 }) },
      platformConfig: { getConfig: async () => null },
      passengerSeatHold: {
        normalizeSeatNumbers: (seats) => seats.map((s) => s.toLowerCase()),
        createOrReusePassengerSeatHold: async () => { holdCalled = true; },
      },
      policy,
      mapper,
    });

    const res = await service.preparePassengerBooking({
      scheduleId: 't1',
      seatNumbers: ['A1'],
      originalAmount: 1000,
      couponCode: 'EXPIRED',
      userId: 'u1',
    });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, 'Coupon expired');
    assert.equal(res.body.errorCode, 'COUPON_EXPIRED');
    assert.equal(holdCalled, false);
  });
});
