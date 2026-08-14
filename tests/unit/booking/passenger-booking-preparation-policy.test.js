const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../../src/modules/booking/passenger-booking-preparation/passenger-booking-preparation.policy.js');

test('seat-layout pricing is authoritative per selected passenger place', () => {
  const pricing = {
    snapshot: {
      layout: {
        sections: [{ elements: [
          { elementId: 'seat-a1', kind: 'SEAT', label: 'A1' },
          { elementId: 'berth-u1', kind: 'BERTH', label: 'U1' },
        ] }],
      },
      placeStates: [
        { elementId: 'seat-a1', state: 'OPEN' },
        { elementId: 'berth-u1', state: 'OPEN' },
      ],
      pricing: { defaultFare: 900, overrides: [{ elementId: 'berth-u1', fare: 1400 }] },
    },
    control: {
      defaultFareOverride: 1000,
      fareOverrides: [{ elementId: 'berth-u1', fare: 1500 }],
      stateOverrides: [],
    },
  };
  assert.deepEqual(policy.calculateSeatLayoutOriginalAmount(pricing, ['a1', 'U1']), {
    isValid: true,
    originalAmount: 2500,
  });
});
test('seat-layout pricing rejects withdrawn passenger places', () => {
  const pricing = {
    snapshot: {
      layout: { sections: [{ elements: [{ elementId: 'a1', kind: 'SEAT', label: 'A1' }] }] },
      placeStates: [{ elementId: 'a1', state: 'OPEN' }],
      pricing: { defaultFare: 900, overrides: [] },
    },
    control: { stateOverrides: [{ elementId: 'a1', state: 'WITHDRAWN' }] },
  };
  const result = policy.calculateSeatLayoutOriginalAmount(pricing, ['A1']);
  assert.equal(result.isValid, false);
  assert.equal(result.responseBody.errorCode, 'SEAT_UNAVAILABLE');
});
test('passenger-booking-preparation policy tests', async (t) => {
  await t.test('1. validatePreparationInput rejects missing fields', () => {
    assert.equal(policy.validatePreparationInput({}).isValid, false);
    assert.equal(policy.validatePreparationInput({ scheduleId: 't1', seatNumbers: ['a1'] }).isValid, true);
    assert.equal(policy.validatePreparationInput({ scheduleId: 't1', seatNumbers: [], originalAmount: 100 }).isValid, false);
    assert.equal(policy.validatePreparationInput({ scheduleId: 't1', seatNumbers: ['a1'], originalAmount: 100 }).isValid, true);
  });

  await t.test('server fare is authoritative and multiplies by seat count', () => {
    const tripFare = policy.calculateAuthoritativeOriginalAmount(
      { tripFare: 750, routeId: { basePrice: 500 } },
      2
    );
    assert.deepEqual(tripFare, { isValid: true, originalAmount: 1500 });
    const routeFare = policy.calculateAuthoritativeOriginalAmount(
      { tripFare: null, routeId: { basePrice: 500 } },
      3
    );
    assert.equal(routeFare.originalAmount, 1500);
    const missing = policy.calculateAuthoritativeOriginalAmount({}, 1);
    assert.equal(missing.responseBody.errorCode, 'TRIP_FARE_UNAVAILABLE');
  });

  await t.test('2. validateTripForOnlineBooking handles missing trip', () => {
    const now = new Date('2026-07-25T12:00:00.000Z');
    assert.equal(policy.validateTripForOnlineBooking(null, now).statusCode, 404);
  });

  await t.test('3. booking-before-now: bookingClosesAt < now => BOOKING_WINDOW_CLOSED', () => {
    const now = new Date('2026-07-25T12:00:00.000Z');
    const before = '2026-07-25T11:59:59.999Z';
    const result = policy.validateTripForOnlineBooking({ status: 'scheduled', bookingClosesAt: before }, now);
    assert.equal(result.isValid, false);
    assert.equal(result.responseBody.errorCode, 'BOOKING_WINDOW_CLOSED');
    assert.equal(result.statusCode, 400);
  });

  await t.test('4. booking-equal-now: bookingClosesAt === now => accepted (strict less-than)', () => {
    const now = new Date('2026-07-25T12:00:00.000Z');
    const equal = '2026-07-25T12:00:00.000Z';
    const result = policy.validateTripForOnlineBooking({ status: 'scheduled', bookingClosesAt: equal }, now);
    assert.equal(result.isValid, true);
  });

  await t.test('5. booking-after-now: bookingClosesAt > now => accepted when scheduled', () => {
    const now = new Date('2026-07-25T12:00:00.000Z');
    const after = '2026-07-25T12:00:00.001Z';
    const result = policy.validateTripForOnlineBooking({ status: 'scheduled', bookingClosesAt: after }, now);
    assert.equal(result.isValid, true);
  });

  await t.test('6. boarding status is accepted when window is open', () => {
    const now = new Date('2026-07-25T12:00:00.000Z');
    const after = '2026-07-25T12:00:00.001Z';
    const result = policy.validateTripForOnlineBooking({ status: 'boarding', bookingClosesAt: after }, now);
    assert.equal(result.isValid, true);
  });

  await t.test('7. cancelled status is rejected even when window is open', () => {
    const now = new Date('2026-07-25T12:00:00.000Z');
    const after = '2026-07-25T12:00:00.001Z';
    const result = policy.validateTripForOnlineBooking({ status: 'cancelled', bookingClosesAt: after }, now);
    assert.equal(result.isValid, false);
    assert.equal(result.responseBody.errorCode, 'TRIP_NOT_BOOKABLE');
  });

  await t.test('8. null bookingClosesAt skips window check', () => {
    const now = new Date('2026-07-25T12:00:00.000Z');
    const result = policy.validateTripForOnlineBooking({ status: 'scheduled', bookingClosesAt: null }, now);
    assert.equal(result.isValid, true);
  });

  await t.test('9. classifyRequestedSeats classifies invalid and booked seats', () => {
    const seatDoc = {
      seata: [{ seatNo: 'A1', booked: false }, { seatNo: 'A2', booked: true }],
      seatb: [],
      seatc: [],
    };
    const res = policy.classifyRequestedSeats(seatDoc, ['a1', 'a2', 'z9']);
    assert.deepEqual(res.invalidSeats, ['Z9']);
    assert.deepEqual(res.alreadyBookedSeats, ['A2']);

    const validRes = policy.classifyRequestedSeats(seatDoc, ['a1']);
    assert.deepEqual(validRes.invalidSeats, []);
    assert.deepEqual(validRes.alreadyBookedSeats, []);
  });

  await t.test('10. calculatePreparationQuote rules', () => {
    const q1 = policy.calculatePreparationQuote({ originalAmount: 1000, requestedSmMoney: -50, spendableBalance: 500 });
    assert.equal(q1.smMoneyApplied, 0);

    const q2 = policy.calculatePreparationQuote({ originalAmount: 1000, requestedSmMoney: 49.9, spendableBalance: 500 });
    assert.equal(q2.smMoneyApplied, 49);

    // Balance cap
    const q3 = policy.calculatePreparationQuote({ originalAmount: 1000, requestedSmMoney: 500, spendableBalance: 200 });
    assert.equal(q3.smMoneyApplied, 200);

    // 80% combined discount cap: 800 total max. Coupon 500 => max SM money 300.
    const q4 = policy.calculatePreparationQuote({ originalAmount: 1000, couponDiscount: 500, requestedSmMoney: 400, spendableBalance: 1000 });
    assert.equal(q4.maxSmMoneyAllowed, 300);
    assert.equal(q4.smMoneyApplied, 300);
    assert.equal(q4.gatewayAmount, 200);
    assert.equal(q4.paymentAmount, 200);
  });
});
