const test = require('node:test');
const assert = require('node:assert/strict');
const { createPassengerBookingPreparationService } = require('../../../src/modules/booking/passenger-booking-preparation/passenger-booking-preparation.service.js');
const policy = require('../../../src/modules/booking/passenger-booking-preparation/passenger-booking-preparation.policy.js');
const mapper = require('../../../src/modules/booking/passenger-booking-preparation/passenger-booking-preparation.mapper.js');

const fakeTrip = { _id: 't1', status: 'scheduled', tripFare: 1000 };
const fakeSeatDoc = { seata: [{ seatNo: 'A1', booked: false }], seatb: [], seatc: [] };

function makeService(balanceResult) {
  let holdCalled = false;
  let mapperCalled = false;

  const service = createPassengerBookingPreparationService({
    repository: {
      findBookableTripContext: async () => fakeTrip,
      findTripSeatDocument: async () => fakeSeatDoc,
    },
    couponHelper: {},
    smLedgerService: { computeSpendableBalance: async () => balanceResult },
    platformConfig: { getConfig: async () => ({ maxDiscountPercent: 80 }) },
    passengerSeatHold: {
      normalizeSeatNumbers: (s) => s.map((x) => x.toLowerCase()),
      createOrReusePassengerSeatHold: async () => { holdCalled = true; return {}; },
    },
    policy,
    mapper: {
      ...mapper,
      mapPassengerBookingPreparationResponse: (...args) => { mapperCalled = true; return mapper.mapPassengerBookingPreparationResponse(...args); },
      mapValidatedCoupon: mapper.mapValidatedCoupon,
    },
  });

  return { service, isHoldCalled: () => holdCalled, isMapperCalled: () => mapperCalled };
}

test('passenger-booking-preparation balance failure tests', async (t) => {
  await t.test('1. null balanceResult causes service to throw', async () => {
    const { service, isHoldCalled, isMapperCalled } = makeService(null);

    await assert.rejects(
      () => service.preparePassengerBooking({
        scheduleId: 't1',
        seatNumbers: ['A1'],
        originalAmount: 1000,
        userId: 'u1',
      }),
      (err) => err instanceof TypeError
    );

    assert.equal(isHoldCalled(), false, 'seat-hold must not be called');
    assert.equal(isMapperCalled(), false, 'response mapper must not be called');
  });

  await t.test('2. undefined balanceResult causes service to throw', async () => {
    const { service, isHoldCalled, isMapperCalled } = makeService(undefined);

    await assert.rejects(
      () => service.preparePassengerBooking({
        scheduleId: 't1',
        seatNumbers: ['A1'],
        originalAmount: 1000,
        userId: 'u1',
      }),
      (err) => err instanceof TypeError
    );

    assert.equal(isHoldCalled(), false, 'seat-hold must not be called');
    assert.equal(isMapperCalled(), false, 'response mapper must not be called');
  });

  await t.test('3. valid balanceResult with display:500 succeeds', async () => {
    const { service } = makeService({ display: 500 });

    const res = await service.preparePassengerBooking({
      scheduleId: 't1',
      seatNumbers: ['A1'],
      originalAmount: 1000,
      smMoneyToUse: 0,
      userId: 'u1',
      activeRole: 'passenger',
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.smMoneyBalance, 500);
  });
});
