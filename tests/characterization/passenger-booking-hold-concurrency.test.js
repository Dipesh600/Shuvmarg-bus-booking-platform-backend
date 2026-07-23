'use strict';

/**
 * tests/characterization/passenger-booking-hold-concurrency.test.js
 *
 * Real MongoMemoryServer database concurrency & index tests for passenger seat hold.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const db = require('../helpers/db');
const ensureIndexes = require('../../scripts/ensurePassengerSeatHoldIndexes');
const service = require('../../src/modules/booking/passenger-seat-hold/create-passenger-seat-hold.service');

const tripId = '507f1f77bcf86cd799439011';
const user1 = '507f1f77bcf86cd799439012';
const user2 = '507f1f77bcf86cd799439013';

test('Passenger Seat Hold — Database Concurrency & Single-Field Unique Indexes', async (t) => {
  t.before(async () => {
    await db.connect();
    await ensureIndexes(mongoose);
  });
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('index migration script can be run twice idempotently without failure', async () => {
    const res = await ensureIndexes(mongoose);
    assert.equal(res.success, true);
    const indexes = await mongoose.connection.collection('seatholds').indexes();
    const names = indexes.map((idx) => idx.name);
    assert.ok(names.includes('uniq_active_trip_seat_hold'));
    assert.ok(names.includes('uniq_active_user_trip_hold'));
  });

  await t.test('parallel competing holds for same seat: exactly one succeeds, one receives 409', async () => {
    const results = await Promise.allSettled([
      service.createOrReusePassengerSeatHold({ userId: user1, tripId, seatNumbers: ['a1'] }),
      service.createOrReusePassengerSeatHold({ userId: user2, tripId, seatNumbers: ['a1'] }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one hold must succeed');
    assert.equal(rejected.length, 1, 'Exactly one hold must fail');
    assert.equal(rejected[0].reason.statusCode, 409);
    assert.equal(rejected[0].reason.responseBody.errorCode, 'SEAT_TEMPORARILY_HELD');
  });

  await t.test('parallel requests for disjoint seats both succeed', async () => {
    const [h1, h2] = await Promise.all([
      service.createOrReusePassengerSeatHold({ userId: user1, tripId, seatNumbers: ['a1'] }),
      service.createOrReusePassengerSeatHold({ userId: user2, tripId, seatNumbers: ['a2'] }),
    ]);
    assert.ok(h1.tempBookingId);
    assert.ok(h2.tempBookingId);
    assert.notEqual(h1.tempBookingId, h2.tempBookingId);
  });

  await t.test('parallel identical retries for same passenger return single shared hold', async () => {
    const [h1, h2] = await Promise.all([
      service.createOrReusePassengerSeatHold({ userId: user1, tripId, seatNumbers: ['a1'] }),
      service.createOrReusePassengerSeatHold({ userId: user1, tripId, seatNumbers: ['a1'] }),
    ]);
    assert.equal(h1.tempBookingId, h2.tempBookingId);
  });

  await t.test('expired overlapping seat hold does not block another passenger', async () => {
    const past = new Date(Date.now() - 700000);
    await service.createOrReusePassengerSeatHold({ userId: user1, tripId, seatNumbers: ['a1'], now: past });
    const h2 = await service.createOrReusePassengerSeatHold({ userId: user2, tripId, seatNumbers: ['a1'], now: new Date() });
    assert.ok(h2.tempBookingId);
  });
});
