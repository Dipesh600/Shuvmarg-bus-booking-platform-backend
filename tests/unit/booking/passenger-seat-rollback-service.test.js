'use strict';

/**
 * tests/unit/booking/passenger-seat-rollback-service.test.js
 * Unit tests for passenger seat rollback service.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createPassengerSeatRollbackService,
} = require('../../../src/modules/booking/passenger-seat-commitment/passenger-seat-rollback.service.js');

test('passengerSeatRollbackService unit tests', async (t) => {
  await t.test('rejects missing or invalid repository dependency', () => {
    assert.throws(
      () => createPassengerSeatRollbackService({}),
      /createPassengerSeatRollbackService requires repository with findSeatDocumentByTripId and rollbackSeat/
    );
  });

  await t.test('missing seat document returns ok result without rollback calls', async () => {
    let rollbackCalled = false;
    const service = createPassengerSeatRollbackService({
      repository: {
        findSeatDocumentByTripId: async () => null,
        rollbackSeat: async () => { rollbackCalled = true; },
      },
    });

    const res = await service.rollbackPassengerSeatLocks({
      tripId: 'trip-1',
      seatNumbers: ['A1', 'B1'],
      userId: 'u-1',
    });
    assert.deepEqual(res, {
      ok: true,
      attempted: 2,
      rolledBack: 0,
      skipped: 0,
      failed: 0,
    });
    assert.equal(rollbackCalled, false);
  });

  await t.test('detects seata, seatb, seatc, uses exact casing, and skips unknown seats', async () => {
    const rolledBackList = [];
    const dummyDoc = {
      seata: [{ seatNo: 'A1' }],
      seatb: [{ seatNo: 'B2' }],
      seatc: [{ seatNo: 'C3' }],
    };

    const service = createPassengerSeatRollbackService({
      repository: {
        findSeatDocumentByTripId: async () => dummyDoc,
        rollbackSeat: async ({ arrayField, seatNo }) => {
          rolledBackList.push({ arrayField, seatNo });
        },
      },
    });

    const res = await service.rollbackPassengerSeatLocks({
      tripId: 'trip-1',
      seatNumbers: ['a1', 'b2', 'c3', 'unknown-seat'],
      userId: 'u-1',
    });

    assert.deepEqual(res, {
      ok: true,
      attempted: 4,
      rolledBack: 3,
      skipped: 1,
      failed: 0,
    });
    assert.deepEqual(rolledBackList, [
      { arrayField: 'seata', seatNo: 'A1' },
      { arrayField: 'seatb', seatNo: 'B2' },
      { arrayField: 'seatc', seatNo: 'C3' },
    ]);
  });

  await t.test('individual rollback error is logged, does not throw, and later seats still rollback', async () => {
    const rolledBackList = [];
    const logs = [];
    const dummyDoc = {
      seata: [{ seatNo: 'A1' }, { seatNo: 'A2' }, { seatNo: 'A3' }],
    };

    const service = createPassengerSeatRollbackService({
      repository: {
        findSeatDocumentByTripId: async () => dummyDoc,
        rollbackSeat: async ({ seatNo }) => {
          if (seatNo === 'A2') {
            throw new Error('Simulated database error');
          }
          rolledBackList.push(seatNo);
        },
      },
      logger: {
        error: (msg, meta) => logs.push({ msg, meta }),
      },
    });

    const res = await service.rollbackPassengerSeatLocks({
      tripId: 'trip-1',
      seatNumbers: ['A1', 'A2', 'A3'],
      userId: 'u-1',
    });

    assert.deepEqual(res, {
      ok: true,
      attempted: 3,
      rolledBack: 2,
      skipped: 0,
      failed: 1,
    });
    assert.deepEqual(rolledBackList, ['A1', 'A3']);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].msg, 'confirmBooking: seat rollback failed for individual seat');
    assert.deepEqual(logs[0].meta, {
      tripId: 'trip-1',
      seatNo: 'A2',
      userId: 'u-1',
      error: 'Simulated database error',
    });
  });
});
