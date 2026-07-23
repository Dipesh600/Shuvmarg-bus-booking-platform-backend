'use strict';

/**
 * tests/unit/booking/passenger-seat-hold-service.test.js
 * Unit tests for createOrReusePassengerSeatHold service.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../../../src/modules/booking/passenger-seat-hold/create-passenger-seat-hold.service');
const repository = require('../../../src/modules/booking/passenger-seat-hold/passenger-seat-hold.repository');

const patch = (obj, key, fn, restore) => {
  const old = obj[key];
  obj[key] = fn;
  restore.push(() => { obj[key] = old; });
};

test('createOrReusePassengerSeatHold Service', async (t) => {
  await t.test('creates new hold with random tempBookingId when no existing hold', async () => {
    const restore = [];
    let createdData;
    patch(repository, 'deleteExpiredConflicts', async () => {}, restore);
    patch(repository, 'findActiveLegacyConflicts', async () => [], restore);
    patch(repository, 'findActiveHoldForUserTrip', async () => null, restore);
    patch(repository, 'createHold', async (d) => { createdData = d; return { ...d, _id: 'h1' }; }, restore);
    try {
      const res = await service.createOrReusePassengerSeatHold({
        userId: 'u1', tripId: 't1', seatNumbers: ['a1', 'a2'], now: new Date(),
      });
      assert.equal(res.tempBookingId.startsWith('BH'), true);
      assert.deepEqual(res.seatNumbers, ['a1', 'a2']);
      assert.equal(createdData.seatKeys.length, 2);
      assert.equal(createdData.userTripKey, 'u1:t1');
      assert.equal(res.seatKeys, undefined);
      assert.equal(res.userTripKey, undefined);
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('exact retry returns existing hold idempotently without extending expiry', async () => {
    const restore = [];
    const exp = new Date(Date.now() + 300000);
    const existing = { _id: 'h1', userId: 'u1', tripId: 't1', seatNumbers: ['a1'], tempBookingId: 'BH123', status: 'held', expiresAt: exp, seatKeys: ['t1:a1'], userTripKey: 'u1:t1' };
    patch(repository, 'deleteExpiredConflicts', async () => {}, restore);
    patch(repository, 'findActiveLegacyConflicts', async () => [], restore);
    patch(repository, 'findActiveHoldForUserTrip', async () => existing, restore);
    try {
      const res = await service.createOrReusePassengerSeatHold({
        userId: 'u1', tripId: 't1', seatNumbers: ['A1'], now: new Date(),
      });
      assert.equal(res.tempBookingId, 'BH123');
      assert.equal(res.expiresAt, exp);
      assert.equal(res.seatKeys, undefined);
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('seat selection change updates existing hold preserving tempBookingId and expiresAt', async () => {
    const restore = [];
    const exp = new Date(Date.now() + 300000);
    const existing = { _id: 'h1', userId: 'u1', tripId: 't1', seatNumbers: ['a1'], tempBookingId: 'BH123', status: 'held', expiresAt: exp, seatKeys: ['t1:a1'], userTripKey: 'u1:t1' };
    let updateCalled = false;
    patch(repository, 'deleteExpiredConflicts', async () => {}, restore);
    patch(repository, 'findActiveLegacyConflicts', async () => [], restore);
    patch(repository, 'findActiveHoldForUserTrip', async () => existing, restore);
    patch(repository, 'updateOwnedActiveHold', async () => { updateCalled = true; return { ...existing, seatNumbers: ['a2'], seatKeys: ['t1:a2'] }; }, restore);
    try {
      const res = await service.createOrReusePassengerSeatHold({
        userId: 'u1', tripId: 't1', seatNumbers: ['a2'], now: new Date(),
      });
      assert.equal(updateCalled, true);
      assert.equal(res.tempBookingId, 'BH123');
      assert.deepEqual(res.seatNumbers, ['a2']);
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('legacy hold owned by passenger is upgraded with canonical keys on re-read', async () => {
    const restore = [];
    const legacyDoc = { _id: 'hl', userId: 'u1', tripId: 't1', seatNumbers: ['a1'], tempBookingId: 'BHLEG', status: 'held', expiresAt: new Date(Date.now() + 300000) };
    let upgradedData;
    patch(repository, 'deleteExpiredConflicts', async () => {}, restore);
    patch(repository, 'findActiveLegacyConflicts', async () => [], restore);
    patch(repository, 'findActiveHoldForUserTrip', async () => legacyDoc, restore);
    patch(repository, 'updateOwnedActiveHold', async (id, uid, tid, seats, keys, utKey) => {
      upgradedData = { keys, utKey };
      return { ...legacyDoc, seatNumbers: seats, seatKeys: keys, userTripKey: utKey };
    }, restore);
    try {
      const res = await service.createOrReusePassengerSeatHold({
        userId: 'u1', tripId: 't1', seatNumbers: ['a1'], now: new Date(),
      });
      assert.equal(res.tempBookingId, 'BHLEG');
      assert.deepEqual(upgradedData.keys, ['t1:a1']);
      assert.equal(upgradedData.utKey, 'u1:t1');
      assert.equal(res.seatKeys, undefined);
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('legacy upgrade conflict preserves original hold and returns 409 SEAT_TEMPORARILY_HELD', async () => {
    const restore = [];
    const legacyDoc = { _id: 'hl', userId: 'u1', tripId: 't1', seatNumbers: ['a1'], tempBookingId: 'BHLEG', status: 'held', expiresAt: new Date(Date.now() + 300000) };
    patch(repository, 'deleteExpiredConflicts', async () => {}, restore);
    patch(repository, 'findActiveLegacyConflicts', async () => [], restore);
    patch(repository, 'findActiveHoldForUserTrip', async () => legacyDoc, restore);
    patch(repository, 'updateOwnedActiveHold', async () => {
      const err = new Error('E11000 duplicate key error');
      err.code = 11000;
      throw err;
    }, restore);
    try {
      await assert.rejects(
        () => service.createOrReusePassengerSeatHold({ userId: 'u1', tripId: 't1', seatNumbers: ['a1'] }),
        (err) => {
          assert.equal(err.statusCode, 409);
          assert.equal(err.responseBody.errorCode, 'SEAT_TEMPORARILY_HELD');
          return true;
        }
      );
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('second update null performs final authoritative re-read and never returns stale state', async () => {
    const restore = [];
    const initialDoc = { _id: 'h1', userId: 'u1', tripId: 't1', seatNumbers: ['a2'], tempBookingId: 'BH123', status: 'held', expiresAt: new Date(Date.now() + 300000), seatKeys: ['t1:a2'], userTripKey: 'u1:t1' };
    const canonicalDoc = { _id: 'h1', userId: 'u1', tripId: 't1', seatNumbers: ['a1'], tempBookingId: 'BH123', status: 'held', expiresAt: new Date(Date.now() + 300000), seatKeys: ['t1:a1'], userTripKey: 'u1:t1' };
    let reReadCount = 0;
    patch(repository, 'deleteExpiredConflicts', async () => {}, restore);
    patch(repository, 'findActiveLegacyConflicts', async () => [], restore);
    patch(repository, 'findActiveHoldForUserTrip', async () => {
      reReadCount++;
      return reReadCount === 1 ? initialDoc : canonicalDoc;
    }, restore);
    patch(repository, 'updateOwnedActiveHold', async () => null, restore);
    try {
      const res = await service.createOrReusePassengerSeatHold({
        userId: 'u1', tripId: 't1', seatNumbers: ['a1'], now: new Date(),
      });
      assert.equal(res.tempBookingId, 'BH123');
      assert.equal(reReadCount >= 2, true);
    } finally { restore.reverse().forEach((f) => f()); }
  });
});
