'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require(
  '../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.policy'
);
const tripPolicy = require(
  '../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout-trip.policy'
);

test('passengers must exactly cover the held seat set', () => {
  const passengers = policy.normalizePassengerDetails(
    [
      { name: 'Ram Shah', gender: 'M', seatNo: 'A1' },
      { name: 'Sita Shah', gender: 'F', seatNo: 'B2' },
    ],
    ['a1', 'b2']
  );
  assert.deepEqual(passengers, [
    { name: 'Ram Shah', gender: 'male', seatNo: 'a1' },
    { name: 'Sita Shah', gender: 'female', seatNo: 'b2' },
  ]);
  assert.throws(
    () => policy.normalizePassengerDetails(
      [{ name: 'Ram Shah', gender: 'M', seatNo: 'a1' }],
      ['a1', 'b2']
    ),
    { code: 'ESEWA_CHECKOUT_INVALID' }
  );
});

test('duplicate, foreign, and malformed passenger seats are rejected', () => {
  for (const details of [
    [
      { name: 'Ram Shah', gender: 'M', seatNo: 'a1' },
      { name: 'Sita Shah', gender: 'F', seatNo: 'a1' },
    ],
    [{ name: 'Ram Shah', gender: 'M', seatNo: 'z9' }],
    [{ name: 'R', gender: 'unknown', seatNo: 'a1' }],
  ]) {
    assert.throws(
      () => policy.normalizePassengerDetails(details, ['a1', 'b2']),
      { code: 'ESEWA_CHECKOUT_INVALID' }
    );
  }
});

test('transaction UUID and amount obey eSewa form constraints', () => {
  const uuid = policy.createTransactionUuid(
    new Date('2026-07-28T00:00:00.000Z'),
    '12345678-1234-1234-1234-123456789abc'
  );
  assert.match(uuid, /^[A-Za-z0-9-]+$/);
  assert.equal(policy.formatAmount(100), '100');
  assert.equal(policy.formatAmount(100.5), '100.5');
  assert.throws(() => policy.formatAmount(0));
});

test('boarding and dropping points must come from the trip configuration', () => {
  assert.deepEqual(
    tripPolicy.resolveCanonicalPoint(
      { name: 'kalanki', time: 'tampered' },
      [{ name: 'Kalanki', time: '08:00' }],
      'Boarding point'
    ),
    { name: 'Kalanki', time: '08:00', stopName: null }
  );
  assert.throws(
    () => tripPolicy.resolveCanonicalPoint(
      { name: 'Unauthorized stop' },
      [{ name: 'Kalanki', time: '08:00' }],
      'Boarding point'
    ),
    { code: 'ESEWA_CHECKOUT_INVALID' }
  );
});

test('journey snapshot is derived from the canonical trip', () => {
  assert.deepEqual(
    tripPolicy.resolveCanonicalTripSnapshot({
      departureTime: '07:30',
      arrivalTime: '14:30',
      routeId: { from: 'Kathmandu', to: 'Pokhara' },
    }),
    {
      bookedFrom: 'Kathmandu',
      bookedTo: 'Pokhara',
      bookedDepartureTime: '07:30',
      bookedArrivalTime: '14:30',
    }
  );
});

test('registry route configuration supplies canonical stop names and timings', () => {
  const trip = {
    variantId: { direction: 'OUTBOUND' },
    scheduleId: {
      operatorRouteConfigId: {
        boardingConfig: [{
          stopId: { _id: 'stop-1', name: 'Kathmandu' },
          boardingPointIds: [{ pointName: 'Kalanki', type: 'BOTH' }],
        }],
        timingConfig: [{
          stopId: 'stop-1',
          estimatedArrival: '07:20',
          estimatedDeparture: '07:30',
          stopBehavior: 'BOTH',
        }],
      },
    },
  };
  const points = tripPolicy.resolveConfiguredCheckoutPoints(trip);
  assert.deepEqual(points.boardingPoints, [{
    name: 'Kalanki',
    time: '07:30',
    stopName: 'Kathmandu',
  }]);
  assert.deepEqual(points.droppingPoints, [{
    name: 'Kalanki',
    time: '07:20',
    stopName: 'Kathmandu',
  }]);
});
