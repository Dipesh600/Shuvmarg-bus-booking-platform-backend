'use strict';

/**
 * tests/unit/booking/passenger-seat-hold-policy.test.js
 *
 * Pure policy unit tests for seat hold policy helpers.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../../../src/modules/booking/passenger-seat-hold/passenger-seat-hold.policy');

test('Passenger Seat Hold — Policy Helpers', async (t) => {
  await t.test('normalizeSeatNumbers trims, lowercases, sorts canonically', () => {
    const seats = [' A2 ', 'a1', '  b10  '];
    const norm = policy.normalizeSeatNumbers(seats);
    assert.deepEqual(norm, ['a1', 'a2', 'b10']);
  });

  await t.test('normalizeSeatNumbers rejects empty array or invalid elements', () => {
    assert.throws(() => policy.normalizeSeatNumbers([]), /non-empty array/);
    assert.throws(() => policy.normalizeSeatNumbers(['a1', '']), /non-empty string/);
    assert.throws(() => policy.normalizeSeatNumbers(['a1', 123]), /non-empty string/);
  });

  await t.test('normalizeSeatNumbers rejects case-insensitive duplicate seats', () => {
    assert.throws(() => policy.normalizeSeatNumbers(['A1', 'a1']), /Duplicate seat/);
  });

  await t.test('buildSeatKeys maps tripId and normalized seats', () => {
    const keys = policy.buildSeatKeys('trip123', ['a1', 'a2']);
    assert.deepEqual(keys, ['trip123:a1', 'trip123:a2']);
  });

  await t.test('buildUserTripKey maps userId and tripId', () => {
    const key = policy.buildUserTripKey('user1', 'trip2');
    assert.equal(key, 'user1:trip2');
  });

  await t.test('sameSeatSet checks exact set equality regardless of order', () => {
    assert.equal(policy.sameSeatSet(['a1', 'a2'], ['A2', 'a1']), true);
    assert.equal(policy.sameSeatSet(['a1'], ['a1', 'a2']), false);
    assert.equal(policy.sameSeatSet(['a1', 'a2'], ['a1', 'a3']), false);
  });

  await t.test('isActiveHold checks status and expiresAt', () => {
    const now = new Date();
    const future = new Date(now.getTime() + 60000);
    const past = new Date(now.getTime() - 1000);

    assert.equal(policy.isActiveHold({ status: 'held', expiresAt: future }, now), true);
    assert.equal(policy.isActiveHold({ status: 'held', expiresAt: past }, now), false);
    assert.equal(policy.isActiveHold({ status: 'completed', expiresAt: future }, now), false);
    assert.equal(policy.isActiveHold(null, now), false);
  });

  await t.test('isLegacyHold detects holds missing seatKeys', () => {
    assert.equal(policy.isLegacyHold({ seatNumbers: ['a1'] }), true);
    assert.equal(policy.isLegacyHold({ seatKeys: [] }), true);
    assert.equal(policy.isLegacyHold({ seatKeys: ['t:a1'] }), false);
  });

  await t.test('generateTempBookingId creates cryptographically random BH string', () => {
    const id1 = policy.generateTempBookingId();
    const id2 = policy.generateTempBookingId();
    assert.ok(id1.startsWith('BH'));
    assert.equal(id1.length, 26);
    assert.notEqual(id1, id2);
  });
});
