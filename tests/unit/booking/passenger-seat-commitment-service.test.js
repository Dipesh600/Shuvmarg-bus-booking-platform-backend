'use strict';

/**
 * tests/unit/booking/passenger-seat-commitment-service.test.js
 * Unit tests for passenger seat commitment service.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const mapper = require('../../../src/modules/booking/passenger-seat-commitment/passenger-seat-commitment.mapper.js');
const {
  createPassengerSeatCommitmentService,
} = require('../../../src/modules/booking/passenger-seat-commitment/passenger-seat-commitment.service.js');

test('passengerSeatCommitmentService unit tests', async (t) => {
  const fixedDate = new Date('2026-07-26T12:00:00Z');
  const createFixedDate = () => new Date(fixedDate.getTime());

  await t.test('1. missing seat document maps to SEAT_DATA_NOT_FOUND', async () => {
    const repository = {
      findSeatDocumentByTripId: async () => null,
      lockSeat: async () => {},
    };
    const service = createPassengerSeatCommitmentService({ repository, mapper, createDate: createFixedDate });
    const res = await service.commitPassengerSeats({ scheduleId: 's1', userId: 'u1', seatNumbers: ['a1'], transactionId: 'tx1' });
    assert.equal(res.failureType, 'SEAT_DATA_NOT_FOUND');
    assert.equal(res.statusCode, 404);
  });

  await t.test('2, 4, 5, 6, 8, 11, 12 & 13. resolves stored canonical casing, array selection order (seata, seatb, seatc), sequential locking, injected date, returns original seatNumbers', async () => {
    const seatDoc = {
      seata: [{ seatNo: 'A1', booked: false }],
      seatb: [{ seatNo: 'B2', booked: false }],
      seatc: [{ seatNo: 'C3', booked: false }],
    };
    const lockedCalls = [];

    const repository = {
      findSeatDocumentByTripId: async () => seatDoc,
      lockSeat: async (params) => {
        lockedCalls.push(params);
        return { _id: 's_ok' };
      },
    };
    const service = createPassengerSeatCommitmentService({ repository, mapper, createDate: createFixedDate });
    const inputSeats = ['a1', 'b2', 'c3'];

    const res = await service.commitPassengerSeats({ scheduleId: 's1', userId: 'u1', seatNumbers: inputSeats, transactionId: 'tx1' });
    assert.equal(res.ok, true);
    assert.deepEqual(res.lockedSeatNumbers, inputSeats);

    assert.equal(lockedCalls.length, 3);
    assert.deepEqual(lockedCalls[0], { scheduleId: 's1', arrayField: 'seata', seatNo: 'A1', userId: 'u1', bookedAt: fixedDate });
    assert.deepEqual(lockedCalls[1], { scheduleId: 's1', arrayField: 'seatb', seatNo: 'B2', userId: 'u1', bookedAt: fixedDate });
    assert.deepEqual(lockedCalls[2], { scheduleId: 's1', arrayField: 'seatc', seatNo: 'C3', userId: 'u1', bookedAt: fixedDate });
  });

  await t.test('3, 7, 9, 10 & 14. unknown seat is uppercase invalid; falsy lock is already booked; all requested seats attempted without skipping; mixed failure mapped', async () => {
    const seatDoc = {
      seata: [{ seatNo: 'A1', booked: false }],
      seatb: [{ seatNo: 'B2', booked: false }],
      seatc: [],
    };
    const lockedCalls = [];

    const repository = {
      findSeatDocumentByTripId: async () => seatDoc,
      lockSeat: async (params) => {
        lockedCalls.push(params);
        if (params.seatNo === 'A1') return null; // simulate already booked
        return { _id: 's_ok' };
      },
    };
    const service = createPassengerSeatCommitmentService({ repository, mapper, createDate: createFixedDate });

    // 'a1' (already booked), 'z9' (unknown -> invalid), 'b2' (lock ok)
    const res = await service.commitPassengerSeats({
      scheduleId: 's1',
      userId: 'u1',
      seatNumbers: ['a1', 'z9', 'b2'],
      transactionId: 'tx_mix',
    });

    assert.equal(res.ok, false);
    assert.equal(res.failureType, 'SEAT_LOCK_FAILED');
    assert.deepEqual(res.invalidSeats, ['Z9']);
    assert.deepEqual(res.alreadyBookedSeats, ['A1']);
    // Notice 'z9' (invalid) did not call repository.lockSeat, but 'b2' was still attempted!
    assert.equal(lockedCalls.length, 2);
    assert.equal(lockedCalls[0].seatNo, 'A1');
    assert.equal(lockedCalls[1].seatNo, 'B2');
  });

  await t.test('15, 16 & 17. propagates lookup errors, lock errors, and malformed seat array exceptions without mapping', async () => {
    const repoFindErr = { findSeatDocumentByTripId: async () => { throw new Error('DB Find Exception'); }, lockSeat: async () => {} };
    const service1 = createPassengerSeatCommitmentService({ repository: repoFindErr, mapper, createDate: createFixedDate });
    await assert.rejects(async () => service1.commitPassengerSeats({ scheduleId: 's', userId: 'u', seatNumbers: ['a1'], transactionId: 'tx' }), { message: 'DB Find Exception' });

    const repoLockErr = {
      findSeatDocumentByTripId: async () => ({ seata: [{ seatNo: 'A1' }], seatb: [], seatc: [] }),
      lockSeat: async () => { throw new Error('DB Lock Exception'); },
    };
    const service2 = createPassengerSeatCommitmentService({ repository: repoLockErr, mapper, createDate: createFixedDate });
    await assert.rejects(async () => service2.commitPassengerSeats({ scheduleId: 's', userId: 'u', seatNumbers: ['a1'], transactionId: 'tx' }), { message: 'DB Lock Exception' });

    const repoMalformed = { findSeatDocumentByTripId: async () => ({ seata: null }), lockSeat: async () => {} };
    const service3 = createPassengerSeatCommitmentService({ repository: repoMalformed, mapper, createDate: createFixedDate });
    await assert.rejects(async () => service3.commitPassengerSeats({ scheduleId: 's', userId: 'u', seatNumbers: ['a1'], transactionId: 'tx' }));
  });
});
