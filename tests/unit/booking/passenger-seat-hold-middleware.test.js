'use strict';

/**
 * tests/unit/booking/passenger-seat-hold-middleware.test.js
 *
 * Unit tests for requireOwnedActivePassengerSeatHold middleware & require-passenger-seat-hold service.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateConfirmationHold, completePassengerHold } = require('../../../src/modules/booking/passenger-seat-hold/require-passenger-seat-hold.service');
const { requireOwnedActivePassengerSeatHold } = require('../../../src/modules/booking/passenger-seat-hold/passenger-seat-hold.middleware');
const repository = require('../../../src/modules/booking/passenger-seat-hold/passenger-seat-hold.repository');

const patch = (obj, key, fn, restore) => {
  const old = obj[key];
  obj[key] = fn;
  restore.push(() => { obj[key] = old; });
};

test('Passenger Seat Hold Middleware & Confirmation Validation', async (t) => {
  await t.test('missing tempBookingId throws 409 BOOKING_HOLD_INVALID', async () => {
    await assert.rejects(
      () => validateConfirmationHold({ tempBookingId: null, userId: 'u1' }),
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.responseBody.errorCode, 'BOOKING_HOLD_INVALID');
        return true;
      }
    );
  });

  await t.test('unknown or unowned hold throws 409 BOOKING_HOLD_INVALID', async () => {
    const restore = [];
    patch(repository, 'findOwnedActiveHoldByTempId', async () => null, restore);
    try {
      await assert.rejects(
        () => validateConfirmationHold({ tempBookingId: 'BH999', userId: 'u1' }),
        (err) => {
          assert.equal(err.statusCode, 409);
          assert.equal(err.responseBody.errorCode, 'BOOKING_HOLD_INVALID');
          return true;
        }
      );
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('trip mismatch throws 409 BOOKING_HOLD_MISMATCH', async () => {
    const restore = [];
    const hold = { _id: 'h1', tripId: 't1', userId: 'u1', seatNumbers: ['a1'], status: 'held', expiresAt: new Date(Date.now() + 60000) };
    patch(repository, 'findOwnedActiveHoldByTempId', async () => hold, restore);
    try {
      await assert.rejects(
        () => validateConfirmationHold({ tempBookingId: 'BH1', userId: 'u1', clientTripId: 't2' }),
        (err) => {
          assert.equal(err.statusCode, 409);
          assert.equal(err.responseBody.errorCode, 'BOOKING_HOLD_MISMATCH');
          return true;
        }
      );
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('seat mismatch throws 409 BOOKING_HOLD_MISMATCH', async () => {
    const restore = [];
    const hold = { _id: 'h1', tripId: 't1', userId: 'u1', seatNumbers: ['a1'], status: 'held', expiresAt: new Date(Date.now() + 60000) };
    patch(repository, 'findOwnedActiveHoldByTempId', async () => hold, restore);
    try {
      await assert.rejects(
        () => validateConfirmationHold({ tempBookingId: 'BH1', userId: 'u1', clientSeats: ['a2'] }),
        (err) => {
          assert.equal(err.statusCode, 409);
          assert.equal(err.responseBody.errorCode, 'BOOKING_HOLD_MISMATCH');
          return true;
        }
      );
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('confirmation succeeds when body scheduleId and seatNumbers are omitted', async () => {
    const restore = [];
    const hold = { _id: 'h1', tripId: 't1', userId: 'u1', seatNumbers: ['a1', 'a2'], status: 'held', expiresAt: new Date(Date.now() + 60000) };
    patch(repository, 'findOwnedActiveHoldByTempId', async () => hold, restore);
    try {
      const res = await validateConfirmationHold({ tempBookingId: 'BH1', userId: 'u1' });
      assert.equal(res.tripId, 't1');
      assert.deepEqual(res.seatNumbers, ['a1', 'a2']);
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('malformed optional assertion fields throw 409 BOOKING_HOLD_MISMATCH', async () => {
    const restore = [];
    const hold = { _id: 'h1', tripId: 't1', userId: 'u1', seatNumbers: ['a1'], status: 'held', expiresAt: new Date(Date.now() + 60000) };
    patch(repository, 'findOwnedActiveHoldByTempId', async () => hold, restore);
    try {
      const malformedCases = [
        { clientTripId: '' },
        { clientSeats: 'a1' },
        { clientSeats: [] },
        { clientSeats: [null] },
      ];
      for (const payload of malformedCases) {
        await assert.rejects(
          () => validateConfirmationHold({ tempBookingId: 'BH1', userId: 'u1', ...payload }),
          (err) => {
            assert.equal(err.statusCode, 409);
            assert.equal(err.responseBody.errorCode, 'BOOKING_HOLD_MISMATCH');
            return true;
          }
        );
      }
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('middleware attaches req.bookingHold and calls next()', async () => {
    const restore = [];
    const hold = { _id: 'h1', tripId: 't1', userId: 'u1', seatNumbers: ['a1'], status: 'held', expiresAt: new Date(Date.now() + 60000) };
    patch(repository, 'findOwnedActiveHoldByTempId', async () => hold, restore);
    try {
      const req = { body: { tempBookingId: 'BH1' }, dbUser: { _id: 'u1' } };
      let nextCalled = false;
      await requireOwnedActivePassengerSeatHold(req, {}, (err) => {
        assert.equal(err, undefined);
        nextCalled = true;
      });
      assert.equal(nextCalled, true);
      assert.equal(req.bookingHold._id, 'h1');
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('completePassengerHold updates database safely without throwing', async () => {
    const restore = [];
    let updated = false;
    patch(repository, 'completeOwnedHold', async () => { updated = true; return { matchedCount: 1 }; }, restore);
    try {
      const res = await completePassengerHold({ holdId: 'h1', userId: 'u1' });
      assert.equal(updated, true);
      assert.equal(res.matchedCount, 1);
    } finally { restore.reverse().forEach((f) => f()); }
  });
});
