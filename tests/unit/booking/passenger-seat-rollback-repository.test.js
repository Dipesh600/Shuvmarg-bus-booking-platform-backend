'use strict';

/**
 * tests/unit/booking/passenger-seat-rollback-repository.test.js
 * Unit tests for passenger seat rollback repository.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createPassengerSeatRollbackRepository,
} = require('../../../src/modules/booking/passenger-seat-commitment/passenger-seat-rollback.repository.js');

test('passengerSeatRollbackRepository unit tests', async (t) => {
  await t.test('rejects missing or invalid Seat model dependency', () => {
    assert.throws(
      () => createPassengerSeatRollbackRepository({}),
      /createPassengerSeatRollbackRepository requires Seat with findOne and findOneAndUpdate/
    );
    assert.throws(
      () => createPassengerSeatRollbackRepository({ Seat: { findOne: () => {} } }),
      /createPassengerSeatRollbackRepository requires Seat with findOne and findOneAndUpdate/
    );
    assert.throws(
      () =>
        createPassengerSeatRollbackRepository({
          Seat: { findOneAndUpdate: () => {} },
        }),
      /createPassengerSeatRollbackRepository requires Seat with findOne and findOneAndUpdate/
    );
  });

  await t.test('findSeatDocumentByTripId calls Seat.findOne with exact tripId', async () => {
    let capturedQuery = null;
    const dummyDoc = { _id: 'sd1' };
    const repo = createPassengerSeatRollbackRepository({
      Seat: {
        findOne: async (query) => {
          capturedQuery = query;
          return dummyDoc;
        },
        findOneAndUpdate: async () => {},
      },
    });

    const res = await repo.findSeatDocumentByTripId('trip-123');
    assert.deepEqual(capturedQuery, { tripId: 'trip-123' });
    assert.equal(res, dummyDoc);
  });

  await t.test('rollbackSeat calls Seat.findOneAndUpdate with exact filter, resets fields, and sets arrayFilters', async () => {
    let capturedFilter = null;
    let capturedUpdate = null;
    let capturedOptions = null;
    const dummyRes = { _id: 'sd1' };

    const repo = createPassengerSeatRollbackRepository({
      Seat: {
        findOne: async () => {},
        findOneAndUpdate: async (filter, update, options) => {
          capturedFilter = filter;
          capturedUpdate = update;
          capturedOptions = options;
          return dummyRes;
        },
      },
    });

    const res = await repo.rollbackSeat({
      tripId: 'trip-123',
      arrayField: 'seata',
      seatNo: 'A1',
      userId: 'user-456',
    });

    assert.equal(res, dummyRes);
    assert.deepEqual(capturedFilter, {
      tripId: 'trip-123',
      seata: { $elemMatch: { seatNo: 'A1', bookedBy: 'user-456' } },
    });
    assert.deepEqual(capturedUpdate, {
      $set: {
        'seata.$[elem].booked': false,
        'seata.$[elem].bookedBy': null,
        'seata.$[elem].bookedAt': null,
      },
    });
    assert.deepEqual(capturedOptions, {
      arrayFilters: [{ 'elem.seatNo': 'A1', 'elem.bookedBy': 'user-456' }],
    });
  });
});
