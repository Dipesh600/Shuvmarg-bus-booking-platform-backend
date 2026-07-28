'use strict';
/**
 * tests/unit/booking/passenger-seat-hold-facade.test.js
 * Direct unit test for passenger-seat-hold domain module facade exports and normalization wiring.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const passengerSeatHold = require('../../../src/modules/booking/passenger-seat-hold');

test('passenger-seat-hold facade contract and module wiring', async (t) => {
  await t.test('1. The facade exports normalizeSeatNumbers', () => {
    assert.equal(typeof passengerSeatHold.normalizeSeatNumbers, 'function');
  });

  await t.test('2. Facade function identity equals policy.normalizeSeatNumbers', () => {
    assert.equal(passengerSeatHold.normalizeSeatNumbers, passengerSeatHold.policy.normalizeSeatNumbers);
  });

  await t.test('3. It normalizes ["A1", " b2 ", "KA"] according to the existing policy', () => {
    const result = passengerSeatHold.normalizeSeatNumbers(['A1', ' b2 ', 'KA']);
    assert.deepEqual(result, ['a1', 'b2', 'ka']);
  });

  await t.test('4. It preserves the policy\'s current invalid-input behaviour', () => {
    assert.throws(() => passengerSeatHold.normalizeSeatNumbers([]), (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.responseBody?.errorCode, 'INVALID_SEAT_SELECTION');
      return true;
    });

    assert.throws(() => passengerSeatHold.normalizeSeatNumbers(['A1', 'A1']), (err) => {
      assert.equal(err.statusCode, 400);
      assert.equal(err.responseBody?.errorCode, 'INVALID_SEAT_SELECTION');
      return true;
    });
  });

  await t.test('5. Existing passenger-seat-hold facade exports remain present', () => {
    const requiredExports = [
      'policy',
      'errors',
      'repository',
      'createOrReusePassengerSeatHold',
      'validateConfirmationHold',
      'completePassengerHold',
      'requireOwnedActivePassengerSeatHold',
      'normalizeSeatNumbers'
    ];

    for (const exp of requiredExports) {
      assert.ok(exp in passengerSeatHold, `Expected export "${exp}" to be present on passengerSeatHold facade.`);
      assert.notEqual(passengerSeatHold[exp], undefined, `Expected export "${exp}" to be defined.`);
    }
  });
});
