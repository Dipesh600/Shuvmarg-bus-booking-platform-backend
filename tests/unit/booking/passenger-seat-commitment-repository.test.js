'use strict';

/**
 * tests/unit/booking/passenger-seat-commitment-repository.test.js
 * Unit tests for passenger seat commitment repository.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createPassengerSeatCommitmentRepository,
} = require('../../../src/modules/booking/passenger-seat-commitment/passenger-seat-commitment.repository.js');

test('passengerSeatCommitmentRepository unit tests', async (t) => {

  await t.test('1-3. rejects missing or invalid Seat model dependency', () => {
    assert.throws(
      () => createPassengerSeatCommitmentRepository({}),
      /createPassengerSeatCommitmentRepository requires Seat with findOne and findOneAndUpdate/
    );
    assert.throws(
      () => createPassengerSeatCommitmentRepository({ Seat: { findOne: () => {} } }),
      /createPassengerSeatCommitmentRepository requires Seat with findOne and findOneAndUpdate/
    );
    assert.throws(
      () => createPassengerSeatCommitmentRepository({ Seat: { findOneAndUpdate: () => {} } }),
      /createPassengerSeatCommitmentRepository requires Seat with findOne and findOneAndUpdate/
    );
  });

  await t.test('4-6. findSeatDocumentByTripId calls Seat.findOne with exact tripId and returns result/null', async () => {
    let capturedQuery = null;
    const dummyDoc = { _id: 'sd1', seata: [], seatb: [], seatc: [] };
    const repo = createPassengerSeatCommitmentRepository({
      Seat: {
        findOne: async (query) => {
          capturedQuery = query;
          return dummyDoc;
        },
        findOneAndUpdate: async () => {},
      },
    });

    const res = await repo.findSeatDocumentByTripId('trip_99');
    assert.deepEqual(capturedQuery, { tripId: 'trip_99' });
    assert.deepEqual(res, dummyDoc);

    const repoNull = createPassengerSeatCommitmentRepository({
      Seat: {
        findOne: async () => null,
        findOneAndUpdate: async () => {},
      },
    });
    const resNull = await repoNull.findSeatDocumentByTripId('missing');
    assert.equal(resNull, null);
  });

  await t.test('7-11. lockSeat passes exact query, $set, arrayFilters, new: true, and returns result', async () => {
    let capturedFilter = null;
    let capturedUpdate = null;
    let capturedOptions = null;
    const updatedDoc = { _id: 'sd1', locked: true };
    const bookedAt = new Date('2026-07-26T12:00:00Z');

    const repo = createPassengerSeatCommitmentRepository({
      Seat: {
        findOne: async () => {},
        findOneAndUpdate: async (filter, update, options) => {
          capturedFilter = filter;
          capturedUpdate = update;
          capturedOptions = options;
          return updatedDoc;
        },
      },
    });

    const res = await repo.lockSeat({
      scheduleId: 'trip_100',
      arrayField: 'seata',
      seatNo: 'A1',
      userId: 'user_55',
      bookedAt,
    });

    assert.deepEqual(capturedFilter, {
      tripId: 'trip_100',
      seata: { $elemMatch: { seatNo: 'A1', booked: false } },
    });
    assert.deepEqual(capturedUpdate, {
      $set: {
        'seata.$[elem].booked': true,
        'seata.$[elem].bookedBy': 'user_55',
        'seata.$[elem].bookedAt': bookedAt,
      },
    });
    assert.deepEqual(capturedOptions, {
      arrayFilters: [{ 'elem.seatNo': 'A1', 'elem.booked': false }],
      new: true,
    });
    assert.deepEqual(res, updatedDoc);
  });

  await t.test('12 & 13. propagates findOne and findOneAndUpdate errors', async () => {
    const repoFindErr = createPassengerSeatCommitmentRepository({
      Seat: {
        findOne: async () => { throw new Error('FindOne Crash'); },
        findOneAndUpdate: async () => {},
      },
    });
    await assert.rejects(async () => repoFindErr.findSeatDocumentByTripId('t'), { message: 'FindOne Crash' });

    const repoUpdateErr = createPassengerSeatCommitmentRepository({
      Seat: {
        findOne: async () => {},
        findOneAndUpdate: async () => { throw new Error('Update Crash'); },
      },
    });
    await assert.rejects(
      async () => repoUpdateErr.lockSeat({ scheduleId: 't', arrayField: 'seata', seatNo: 'A1', userId: 'u', bookedAt: new Date() }),
      { message: 'Update Crash' }
    );
  });
});
