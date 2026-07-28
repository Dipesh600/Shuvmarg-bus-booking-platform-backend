'use strict';

/**
 * tests/unit/booking/passenger-seat-hold-confirmation.test.js
 *
 * Unit tests for confirmation timing, hidden key projection, and prepare response contracts.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const SeatHold = require('../../../models/seatHoldModel');
const repository = require('../../../src/modules/booking/passenger-seat-hold/passenger-seat-hold.repository');

const patch = (obj, key, fn, restore) => {
  const old = obj[key];
  obj[key] = fn;
  restore.push(() => { obj[key] = old; });
};

test('Passenger Seat Hold Confirmation & Projection Contracts', async (t) => {
  await t.test('seatHoldModel defines default: undefined for seatKeys', () => {
    const doc = new SeatHold({
      tripId: '507f1f77bcf86cd799439011',
      userId: '507f1f77bcf86cd799439012',
      seatNumbers: ['a1'],
      originalAmount: 100,
      tempBookingId: 'BH100',
      expiresAt: new Date(),
    });
    const obj = doc.toObject();
    assert.equal(obj.seatKeys, undefined, 'seatKeys must default to undefined so sparse index ignores unkeyed doc');
    assert.equal(obj.completedAt, null, 'completedAt must default to null');
  });

  await t.test('completeOwnedHold sets status completed and completedAt date', async () => {
    const restore = [];
    let updateQuery, updateFields;
    patch(SeatHold, 'updateOne', async (q, u) => {
      updateQuery = q;
      updateFields = u;
      return { matchedCount: 1, modifiedCount: 1 };
    }, restore);
    try {
      const now = new Date();
      await repository.completeOwnedHold('h1', 'u1', now);
      assert.equal(updateQuery._id, 'h1');
      assert.equal(updateQuery.userId, 'u1');
      assert.deepEqual(updateQuery.status, { $in: ['held', 'processing'] });
      assert.equal(updateFields.$set.status, 'completed');
      assert.equal(updateFields.$set.completedAt, now);
      assert.ok('$unset' in updateFields);
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('canonical service projection omits internal seatKeys and userTripKey', async () => {
    const service = require('../../../src/modules/booking/passenger-seat-hold/create-passenger-seat-hold.service');
    const restore = [];
    patch(repository, 'deleteExpiredConflicts', async () => {}, restore);
    patch(repository, 'findActiveLegacyConflicts', async () => [], restore);
    patch(repository, 'findActiveHoldForUserTrip', async () => null, restore);
    patch(repository, 'createHold', async (d) => ({ ...d, _id: 'h1' }), restore);
    try {
      const res = await service.createOrReusePassengerSeatHold({
        userId: 'u1', tripId: 't1', seatNumbers: ['a1'],
        originalAmount: 100,
      });
      assert.equal(res.seatKeys, undefined);
      assert.equal(res.userTripKey, undefined);
      assert.ok(res.tempBookingId);
      assert.deepEqual(res.seatNumbers, ['a1']);
    } finally { restore.reverse().forEach((f) => f()); }
  });
});
