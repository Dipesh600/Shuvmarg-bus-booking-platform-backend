'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require(
  '../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.policy'
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
