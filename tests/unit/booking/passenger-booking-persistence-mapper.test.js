'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  formatPassengerBookingPassengers,
  mapPassengerBookingPaymentMethod,
  mapPassengerBookingPersistencePayload,
} = require('../../../src/modules/booking/passenger-booking-persistence/passenger-booking-persistence.mapper.js');

test('passengerBookingPersistenceMapper unit tests', async (t) => {
  await t.test('1-8. formatPassengerBookingPassengers defaults and seat fallback logic', () => {
    assert.deepEqual(formatPassengerBookingPassengers({}), []);
    assert.deepEqual(formatPassengerBookingPassengers({ passengerDetails: null }), []);

    const res = formatPassengerBookingPassengers({
      passengerDetails: [
        {}, // defaults
        { name: 'Hari', age: 25, gender: 'male', seatNo: 'B2' }, // scalar
        { name: 'Sita', age: 30, gender: 'female', seatNo: ['C3', 'C4'] }, // array
        { name: 'Gita' }, // fallback to normalizedSeats[0]
      ],
      seatNumbers: ['A1', 'A2'],
    });

    assert.deepEqual(res, [
      { name: 'Passenger', age: 0, gender: 'other', seatNo: 'A1' },
      { name: 'Hari', age: 25, gender: 'male', seatNo: 'B2' },
      { name: 'Sita', age: 30, gender: 'female', seatNo: 'C3' },
      { name: 'Gita', age: 0, gender: 'other', seatNo: 'A1' },
    ]);

    const fallbackNoSeats = formatPassengerBookingPassengers({ passengerDetails: [{ name: 'Ram' }], seatNumbers: [] });
    assert.equal(fallbackNoSeats[0].seatNo, 'N/A');
  });

  await t.test('9-13. mapPassengerBookingPaymentMethod rules and priority', () => {
    assert.equal(mapPassengerBookingPaymentMethod({ gateway: 'wallet', smMoneyApplied: 0 }), 'SM_WALLET');
    assert.equal(mapPassengerBookingPaymentMethod({ gateway: 'wallet', smMoneyApplied: 500 }), 'SM_WALLET');
    assert.equal(mapPassengerBookingPaymentMethod({ gateway: 'esewa', smMoneyApplied: 500 }), 'SM_WALLET_SPLIT');
    assert.equal(mapPassengerBookingPaymentMethod({ gateway: 'esewa', smMoneyApplied: 0 }), 'ESEWA');
    assert.equal(mapPassengerBookingPaymentMethod({ gateway: 'khalti', smMoneyApplied: 0 }), 'KHALTI');

    assert.throws(
      () => mapPassengerBookingPaymentMethod({ gateway: null, smMoneyApplied: 0 }),
      TypeError
    );
  });

  await t.test('14-19. mapPassengerBookingPersistencePayload exact shape, null fallbacks, and array references', () => {
    const seats = ['A1', 'A2'];
    const formattedPassengers = [{ name: 'Hari', age: 20, gender: 'male', seatNo: 'A1' }];

    const payload = mapPassengerBookingPersistencePayload({
      userId: 'u1',
      scheduleId: 'sch1',
      trip: { brandId: 'b1', busId: 'bus1' },
      bookedFrom: 'Kathmandu',
      bookedTo: 'Pokhara',
      bookedDepartureTime: '07:00 AM',
      bookedArrivalTime: '02:00 PM',
      seatNumbers: seats,
      formattedPassengers,
      boardingPoint: { name: 'Kalanki' },
      droppingPoint: { name: 'Prithvi Chowk' },
      originalAmount: 1200,
      couponUsed: true,
      appliedCouponCode: 'SAVE100',
      discountAmount: 100,
      finalAmount: 1100,
      smMoneyApplied: 200,
      gatewayAmount: 900,
      gatewayFeeRate: 0.02,
      internalMoneyDebitEntryId: 'd1',
      paymentMethod: 'SM_WALLET_SPLIT',
      transactionId: 'p1',
      ticketId: 'TKT123',
    });

    assert.equal(payload.userId, 'u1');
    assert.equal(payload.tripId, 'sch1');
    assert.equal(payload.brandId, 'b1');
    assert.equal(payload.busId, 'bus1');
    assert.equal(payload.bookedFrom, 'Kathmandu');
    assert.equal(payload.bookedTo, 'Pokhara');
    assert.equal(payload.bookedDepartureTime, '07:00 AM');
    assert.equal(payload.bookedArrivalTime, '02:00 PM');
    assert.equal(payload.seats, seats);
    assert.equal(payload.passengerDetails, formattedPassengers);
    assert.deepEqual(payload.boardingPoint, { name: 'Kalanki' });
    assert.deepEqual(payload.droppingPoint, { name: 'Prithvi Chowk' });
    assert.equal(payload.originalAmount, 1200);
    assert.equal(payload.couponUsed, true);
    assert.equal(payload.couponCode, 'SAVE100');
    assert.equal(payload.discountAmount, 100);
    assert.equal(payload.totalAmount, 1100);
    assert.equal(payload.smMoneyUsed, 200);
    assert.equal(payload.gatewayAmount, 900);
    assert.equal(payload.gatewayFeeRate, 0.02);
    assert.equal(payload.smDebitEntryId, 'd1');
    assert.equal(payload.paymentMethod, 'SM_WALLET_SPLIT');
    assert.equal(payload.transactionId, 'p1');
    assert.equal(payload.bookedVia, 'APP');
    assert.equal(payload.ticketId, 'TKT123');

    // Fallbacks test
    const payloadFallbacks = mapPassengerBookingPersistencePayload({
      trip: {},
      boardingPoint: null,
      droppingPoint: null,
    });
    assert.equal(payloadFallbacks.brandId, null);
    assert.equal(payloadFallbacks.busId, null);
    assert.equal(payloadFallbacks.bookedFrom, null);
    assert.equal(payloadFallbacks.bookedTo, null);
    assert.equal(payloadFallbacks.bookedDepartureTime, null);
    assert.equal(payloadFallbacks.bookedArrivalTime, null);
    assert.deepEqual(payloadFallbacks.boardingPoint, {});
    assert.deepEqual(payloadFallbacks.droppingPoint, {});
  });

  await t.test('20. missing or falsy trip throws TypeError from direct property access', () => {
    assert.throws(
      () => mapPassengerBookingPersistencePayload({ trip: null }),
      (err) => err instanceof TypeError && (err.message.includes('brandId') || err.message.includes('null'))
    );
    assert.throws(
      () => mapPassengerBookingPersistencePayload({ trip: undefined }),
      (err) => err instanceof TypeError && (err.message.includes('brandId') || err.message.includes('undefined'))
    );
  });
});
