'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SeatHold = require('../../../models/seatHoldModel');
const repository = require(
  '../../../src/modules/booking/passenger-seat-hold/passenger-seat-hold.repository'
);
const confirmationRepository = require(
  '../../../src/modules/booking/passenger-seat-hold/passenger-seat-hold-confirmation.repository'
);
const createService = require(
  '../../../src/modules/booking/passenger-seat-hold/create-passenger-seat-hold.service'
);
const {
  createReleasePassengerSeatHoldService,
} = require(
  '../../../src/modules/booking/passenger-seat-hold/release-passenger-seat-hold.service'
);

const patch = (object, key, replacement, restores) => {
  const original = object[key];
  object[key] = replacement;
  restores.push(() => { object[key] = original; });
};

test('passenger seat-hold security contracts', async (t) => {
  await t.test('hold lasts exactly seven minutes and stores server amount', async () => {
    const restores = [];
    let created;
    patch(repository, 'deleteExpiredConflicts', async () => {}, restores);
    patch(repository, 'findActiveLegacyConflicts', async () => [], restores);
    patch(repository, 'findActiveHoldForUserTrip', async () => null, restores);
    patch(repository, 'createHold', async (data) => {
      created = data;
      return { ...data, _id: 'h1' };
    }, restores);
    const now = new Date('2026-07-28T00:00:00.000Z');
    try {
      await createService.createOrReusePassengerSeatHold({
        userId: 'u1', tripId: 't1', seatNumbers: ['a1'],
        originalAmount: 750, now,
      });
      assert.equal(created.expiresAt.getTime() - now.getTime(), 420000);
      assert.equal(created.originalAmount, 750);
    } finally {
      restores.reverse().forEach((restore) => restore());
    }
  });

  await t.test('more than six seats and missing server amount are rejected', async () => {
    await assert.rejects(
      () => createService.createOrReusePassengerSeatHold({
        userId: 'u1', tripId: 't1',
        seatNumbers: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'],
        originalAmount: 700,
      }),
      /maximum of 6 seats/
    );
    await assert.rejects(
      () => createService.createOrReusePassengerSeatHold({
        userId: 'u1', tripId: 't1', seatNumbers: ['a1'],
      }),
      /server-calculated booking amount/
    );
  });

  await t.test('confirmation claim is atomic and owned', async () => {
    const original = SeatHold.findOneAndUpdate;
    let query, update;
    SeatHold.findOneAndUpdate = async (filter, value) => {
      query = filter;
      update = value;
      return { _id: 'h1' };
    };
    try {
      const heldUntil = new Date('2026-07-28T00:07:00.000Z');
      const claimed = await confirmationRepository.claimOwnedActiveHold(
        'h1', 'u1', heldUntil, new Date('2026-07-28T00:06:30.000Z')
      );
      assert.ok(claimed);
      assert.equal(query._id, 'h1');
      assert.equal(query.userId, 'u1');
      assert.equal(query.status, 'held');
      assert.ok(query.expiresAt.$gt instanceof Date);
      assert.equal(update.$set.heldExpiresAt, heldUntil);
      assert.equal(
        update.$set.expiresAt.getTime(),
        new Date('2026-07-28T00:08:30.000Z').getTime()
      );
    } finally {
      SeatHold.findOneAndUpdate = original;
    }
  });

  await t.test('release is owned, idempotent, and clears unique keys', async () => {
    const restores = [];
    let input;
    patch(repository, 'releaseOwnedHold', async (...args) => {
      input = args;
      return { matchedCount: 0 };
    }, restores);
    const now = new Date('2026-07-28T00:00:00.000Z');
    const release = createReleasePassengerSeatHoldService({
      repository,
      clock: () => now,
    });
    try {
      const result = await release({ tempBookingId: 'BH1', userId: 'u1' });
      assert.equal(result.statusCode, 200);
      assert.deepEqual(input, ['BH1', 'u1', now]);
    } finally {
      restores.reverse().forEach((restore) => restore());
    }
  });

  await t.test('failed confirmation never extends the passenger hold', async () => {
    const original = SeatHold.updateOne;
    const updates = [];
    SeatHold.updateOne = async (filter, update) => {
      updates.push({ filter, update });
      return { matchedCount: 1 };
    };
    const heldUntil = new Date('2026-07-28T00:07:00.000Z');
    try {
      await confirmationRepository.restoreOwnedProcessingHold(
        'h1', 'u1', heldUntil, new Date('2026-07-28T00:06:45.000Z')
      );
      assert.equal(updates[0].update.$set.status, 'held');
      assert.equal(updates[0].update.$set.expiresAt, heldUntil);
      await confirmationRepository.restoreOwnedProcessingHold(
        'h2', 'u1', heldUntil, new Date('2026-07-28T00:07:01.000Z')
      );
      assert.equal(updates[1].update.$set.status, 'released');
      assert.equal(updates[1].update.$unset.seatKeys, '');
    } finally {
      SeatHold.updateOne = original;
    }
  });
});
