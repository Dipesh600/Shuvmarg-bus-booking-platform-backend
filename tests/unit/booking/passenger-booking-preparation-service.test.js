const test = require('node:test');
const assert = require('node:assert/strict');
const { createPassengerBookingPreparationService } = require('../../../src/modules/booking/passenger-booking-preparation/passenger-booking-preparation.service.js');
const policy = require('../../../src/modules/booking/passenger-booking-preparation/passenger-booking-preparation.policy.js');
const mapper = require('../../../src/modules/booking/passenger-booking-preparation/passenger-booking-preparation.mapper.js');

test('passenger-booking-preparation service tests', async (t) => {
  const fakeTrip = { _id: 't1', status: 'scheduled' };
  const fakeSeatDoc = { seata: [{ seatNo: 'A1', booked: false }], seatb: [], seatc: [] };

  await t.test('1. preparePassengerBooking succeeds without coupon and clock is used once with identity', async () => {
    let seatHoldArgs = null;
    let policyNow = null;
    const nowFixed = new Date('2026-07-25T12:00:00Z');
    let clockCallCount = 0;

    // Wrap policy to capture what now value was passed to validateTripForOnlineBooking
    const wrappedPolicy = {
      ...policy,
      validateTripForOnlineBooking(trip, now) {
        policyNow = now;
        return policy.validateTripForOnlineBooking(trip, now);
      },
    };

    const service = createPassengerBookingPreparationService({
      repository: {
        findBookableTripContext: async () => fakeTrip,
        findTripSeatDocument: async () => fakeSeatDoc,
      },
      couponHelper: { validateCoupon: async () => { throw new Error('Should not be called'); } },
      smLedgerService: { computeSpendableBalance: async () => ({ display: 100 }) },
      platformConfig: { getConfig: async () => ({ maxDiscountPercent: 80 }) },
      passengerSeatHold: {
        normalizeSeatNumbers: (seats) => seats.map((s) => s.toLowerCase()),
        createOrReusePassengerSeatHold: async (args) => {
          seatHoldArgs = args;
          return { tempBookingId: 'tmp-123', seatNumbers: args.seatNumbers, expiresAt: '2026-07-25T12:10:00Z' };
        },
      },
      policy: wrappedPolicy,
      mapper,
      clock: () => { clockCallCount++; return nowFixed; },
    });

    const res = await service.preparePassengerBooking({
      scheduleId: 't1',
      seatNumbers: ['A1'],
      originalAmount: 1000,
      smMoneyToUse: 50,
      userId: 'u1',
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.tempBookingId, 'tmp-123');
    assert.equal(res.body.data.smMoneyApplied, 50);
    // clock called exactly once
    assert.equal(clockCallCount, 1);
    // same Date instance passed to policy and hold (strict identity)
    assert.equal(policyNow, nowFixed);
    assert.equal(seatHoldArgs.now, nowFixed);
    assert.deepEqual(seatHoldArgs.seatNumbers, ['a1']);
  });

  await t.test('2. repository or hold failure is propagated', async () => {
    const serviceRepoErr = createPassengerBookingPreparationService({
      repository: {
        findBookableTripContext: async () => { throw new Error('DB Error'); },
        findTripSeatDocument: async () => fakeSeatDoc,
      },
      couponHelper: {},
      smLedgerService: {},
      platformConfig: {},
      passengerSeatHold: { normalizeSeatNumbers: (s) => s.map((x) => x.toLowerCase()) },
      policy,
      mapper,
    });

    await assert.rejects(
      () => serviceRepoErr.preparePassengerBooking({ scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 }),
      /DB Error/
    );

    const serviceHoldErr = createPassengerBookingPreparationService({
      repository: {
        findBookableTripContext: async () => fakeTrip,
        findTripSeatDocument: async () => fakeSeatDoc,
      },
      couponHelper: {},
      smLedgerService: { computeSpendableBalance: async () => ({ display: 0 }) },
      platformConfig: { getConfig: async () => null },
      passengerSeatHold: {
        normalizeSeatNumbers: (s) => s.map((x) => x.toLowerCase()),
        createOrReusePassengerSeatHold: async () => {
          const err = new Error('Hold error');
          err.statusCode = 409;
          err.responseBody = { success: false, message: 'Hold error' };
          throw err;
        },
      },
      policy,
      mapper,
    });

    await assert.rejects(
      () => serviceHoldErr.preparePassengerBooking({ scheduleId: 't1', seatNumbers: ['A1'], originalAmount: 100 }),
      (err) => err.statusCode === 409
    );
  });
});
