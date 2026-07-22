'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../../../src/modules/booking/booking-verification/verify-booking.service');
const repository = require('../../../src/modules/booking/booking-verification/booking-verification.repository');

const patch = (obj, key, fn) => {
  const old = obj[key];
  obj[key] = fn;
  return () => { obj[key] = old; };
};

test('verify-booking service unit tests', async (t) => {
  await t.test('passes exact ticketId and userId to repository', async () => {
    let capturedInput;
    const restore = patch(repository, 'findPassengerBookingByTicketId', async (input) => {
      capturedInput = input;
      return null;
    });

    try {
      await service.verifyPassengerBooking({ ticketId: 'TKT-123', userId: '507f1f77bcf86cd799439011' });
      assert.deepEqual(capturedInput, { ticketId: 'TKT-123', userId: '507f1f77bcf86cd799439011' });
    } finally {
      restore();
    }
  });

  await t.test('returns exact 404 result when booking is missing', async () => {
    const restore = patch(repository, 'findPassengerBookingByTicketId', async () => null);

    try {
      const result = await service.verifyPassengerBooking({ ticketId: 'TKT-999', userId: '507f1f77bcf86cd799439011' });
      assert.deepEqual(result, {
        statusCode: 404,
        responseBody: {
          success: false,
          message: 'Booking not found!',
        },
      });
    } finally {
      restore();
    }
  });

  await t.test('returns exact 200 result with every response field mapped correctly', async () => {
    const mockBooking = {
      _id: '507f1f77bcf86cd799439022',
      ticketId: 'TKT-100',
      scheduleId: '507f1f77bcf86cd799439033',
      tripId: { _id: '507f1f77bcf86cd799439044', route: 'Kathmandu-Pokhara' },
      seats: ['A1', 'A2'],
      originalAmount: 1500,
      discountAmount: 100,
      totalAmount: 1400,
      couponCode: 'OFFER100',
      gateway: 'esewa',
      transactionId: 'TXN-777',
      status: 'confirmed',
      bookedAt: '2026-07-22T00:00:00.000Z',
    };

    const restore = patch(repository, 'findPassengerBookingByTicketId', async () => mockBooking);

    try {
      const result = await service.verifyPassengerBooking({ ticketId: 'TKT-100', userId: '507f1f77bcf86cd799439011' });
      assert.equal(result.statusCode, 200);
      assert.deepEqual(result.responseBody, {
        success: true,
        message: 'Booking verified successfully!',
        data: {
          bookingId: '507f1f77bcf86cd799439022',
          ticketId: 'TKT-100',
          scheduleDetails: '507f1f77bcf86cd799439033',
          seats: ['A1', 'A2'],
          originalAmount: 1500,
          discountAmount: 100,
          totalAmount: 1400,
          couponUsed: 'OFFER100',
          gateway: 'esewa',
          transactionId: 'TXN-777',
          status: 'confirmed',
          bookedAt: '2026-07-22T00:00:00.000Z',
        },
      });

      // Verify specifically that scheduleDetails remains sourced from booking.scheduleId
      assert.equal(result.responseBody.data.scheduleDetails, mockBooking.scheduleId);
      assert.notEqual(result.responseBody.data.scheduleDetails, mockBooking.tripId);
    } finally {
      restore();
    }
  });
});
