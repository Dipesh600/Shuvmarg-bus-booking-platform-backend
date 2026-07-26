'use strict';

/**
 * tests/characterization/payment-booking-confirm-passenger-seat-rollback-failures.test.js
 * Characterization tests verifying rollback behavior during seat commitment failures, outer unexpected errors, and rollback errors.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  setupConfirmHarness,
  makeConfirmReq,
  makeMockConfirmRes,
} = require('../helpers/payment-booking-confirm-harness.js');

test('confirmBooking passenger seat rollback failure path characterization tests', async (t) => {
  let h;
  t.beforeEach(() => { h = setupConfirmHarness(); });
  t.afterEach(() => { h.restore(); });

  const testScenarios = [
    {
      name: '1. seat commitment failure with rollbackRequired: true calls rollback',
      setupFailure: (h, { rollbackCalls }) => {
        h.mockMethod(h.Seat, 'findOneAndUpdate', async (query, update, options) => {
          const isRollback = update && update.$set && Object.values(update.$set).some((v) => v === false);
          if (isRollback) {
            rollbackCalls.push({ query, update, options });
            return { _id: 's1', seatNo: 'A1' };
          }
          return (query && (query.seatb || query.seatc)) ? null : { _id: 's1', seatNo: 'A1' };
        });
      },
      expectedStatus: 409,
    },
    {
      name: '2. outer unexpected-error rollback path after seats were locked',
      setupFailure: (h) => {
        h.mockMethod(h.Booking, 'create', async () => { throw new Error('booking creation error'); });
        h.mockMethod(h.Transaction, 'findByIdAndUpdate', async (id, update) => {
          if (update && update.status === 'DISPUTED') {
            throw new Error('unexpected crash during dispute status update');
          }
          return { _id: id };
        });
      },
      expectedStatus: 500,
    },
    {
      name: '3. rollback failure does not replace primary response and attempts all seats',
      setupFailure: (h, { rollbackCalls }) => {
        h.mockMethod(h.Booking, 'create', async () => { throw new Error('booking creation error'); });
        h.mockMethod(h.Seat, 'findOneAndUpdate', async (query, update, options) => {
          const isRollback = update && update.$set && Object.values(update.$set).some((v) => v === false);
          if (isRollback) {
            rollbackCalls.push({ query, update, options });
            throw new Error('database connection lost during rollback');
          }
          return { _id: 's1', seatNo: 'A1' };
        });
      },
      expectedStatus: 500,
      expectedRollbackCount: 3,
      expectedSeats: [
        { array: 'seata', seatNo: 'A1' },
        { array: 'seatb', seatNo: 'B2' },
        { array: 'seatc', seatNo: 'C3' },
      ],
    },
  ];

  for (const scenario of testScenarios) {
    await t.test(scenario.name, async () => {
      const rollbackCalls = [];

      h.mockMethod(h.Seat, 'findOne', async () => ({
        _id: 'mock_seat_doc_id',
        seata: [{ seatNo: 'A1', booked: false }],
        seatb: [{ seatNo: 'B2', booked: false }],
        seatc: [{ seatNo: 'C3', booked: false }],
      }));

      h.mockMethod(h.Seat, 'findOneAndUpdate', async (query, update, options) => {
        const isRollback = update && update.$set && Object.values(update.$set).some((v) => v === false);
        if (isRollback) rollbackCalls.push({ query, update, options });
        return { _id: 's1', seatNo: 'A1' };
      });

      scenario.setupFailure(h, { rollbackCalls });

      const req = makeConfirmReq();
      req.bookingHold.seatNumbers = ['A1', 'B2', 'C3'];
      const res = makeMockConfirmRes();

      await h.confirmBooking(req, res);

      assert.equal(res.getStatus(), scenario.expectedStatus);
      const expectedCount = scenario.expectedRollbackCount !== undefined ? scenario.expectedRollbackCount : 3;
      assert.equal(rollbackCalls.length, expectedCount, 'Seat.findOneAndUpdate must be called expected times during rollback');

      const expectedSeats = scenario.expectedSeats || [
        { array: 'seata', seatNo: 'A1' },
        { array: 'seatb', seatNo: 'B2' },
        { array: 'seatc', seatNo: 'C3' },
      ];

      for (let i = 0; i < expectedSeats.length; i++) {
        const call = rollbackCalls[i];
        const { array, seatNo } = expectedSeats[i];
        assert.equal(call.query.tripId.toString(), '507f1f77bcf86cd799439011');
        assert.equal(call.query[array].$elemMatch.seatNo, seatNo);
        assert.equal(call.query[array].$elemMatch.bookedBy.toString(), '507f1f77bcf86cd799439012');

        assert.equal(call.update.$set[`${array}.$[elem].booked`], false);
        assert.equal(call.update.$set[`${array}.$[elem].bookedBy`], null);
        assert.equal(call.update.$set[`${array}.$[elem].bookedAt`], null);

        assert.deepEqual(call.options.arrayFilters, [
          { 'elem.seatNo': seatNo, 'elem.bookedBy': '507f1f77bcf86cd799439012' },
        ]);
      }
    });
  }
});
