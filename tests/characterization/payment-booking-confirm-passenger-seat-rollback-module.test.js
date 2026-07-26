'use strict';

/**
 * tests/characterization/payment-booking-confirm-passenger-seat-rollback-module.test.js
 * Characterization tests verifying passenger seat rollback parameters and field reset assertions.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  setupConfirmHarness,
  makeConfirmReq,
  makeMockConfirmRes,
} = require('../helpers/payment-booking-confirm-harness.js');

test('confirmBooking passenger seat rollback module parameters and reset assertions', async (t) => {
  let h;
  t.beforeEach(() => {
    h = setupConfirmHarness();
  });
  t.afterEach(() => {
    h.restore();
  });

  const testScenarios = [
    {
      name: '1. rollback on booking creation error',
      setupFailure: (h) => {
        h.mockMethod(h.Booking, 'create', async () => {
          throw new Error('booking creation error');
        });
      },
      expectedStatus: 500,
    },
    {
      name: '2. rollback on debit verification mismatch',
      setupFailure: (h) => {
        h.mockMethod(h.Booking, 'create', async () => {
          throw new Error('debit verification mismatch');
        });
      },
      expectedStatus: 500,
    },
    {
      name: '3. rollback on debit verification failure',
      setupFailure: (h) => {
        h.mockMethod(h.Booking, 'create', async () => {
          throw new Error('debit verification failure');
        });
      },
      expectedStatus: 500,
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
        const isRollback =
          update &&
          update.$set &&
          Object.values(update.$set).some((val) => val === false);
        if (isRollback) {
          rollbackCalls.push({ query, update, options });
        }
        return { _id: 's1', seatNo: 'A1' };
      });

      scenario.setupFailure(h);

      const req = makeConfirmReq();
      req.bookingHold.seatNumbers = ['A1', 'B2', 'C3'];
      const res = makeMockConfirmRes();

      await h.confirmBooking(req, res);

      assert.equal(res.getStatus(), scenario.expectedStatus);
      assert.equal(
        rollbackCalls.length,
        3,
        'Seat.findOneAndUpdate must be called for every seat number during rollback'
      );

      const expectedSeats = [
        { array: 'seata', seatNo: 'A1' },
        { array: 'seatb', seatNo: 'B2' },
        { array: 'seatc', seatNo: 'C3' },
      ];

      for (let i = 0; i < expectedSeats.length; i++) {
        const call = rollbackCalls[i];
        const { array, seatNo } = expectedSeats[i];

        // Verify exact query constraints
        assert.equal(call.query.tripId.toString(), '507f1f77bcf86cd799439011');
        assert.equal(call.query[array].$elemMatch.seatNo, seatNo);
        assert.equal(call.query[array].$elemMatch.bookedBy.toString(), '507f1f77bcf86cd799439012');

        // Verify exact update field resets
        assert.equal(call.update.$set[`${array}.$[elem].booked`], false);
        assert.equal(call.update.$set[`${array}.$[elem].bookedBy`], null);
        assert.equal(call.update.$set[`${array}.$[elem].bookedAt`], null);

        // Verify arrayFilters
        assert.deepEqual(call.options.arrayFilters, [
          { 'elem.seatNo': seatNo, 'elem.bookedBy': '507f1f77bcf86cd799439012' },
        ]);
      }
    });
  }
});
