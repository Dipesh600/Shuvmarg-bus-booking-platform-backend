'use strict';

/**
 * tests/unit/booking/confirm-booking-hardening.test.js
 *
 * Unit tests verifying prepareBooking seat normalization, confirmBooking pre-side-effect quote validation,
 * atomic SUCCESS transaction transition, and isolated post-commit handling.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareBooking, confirmBooking } = require('../../../controllers/ticketController/paymentBookingController');
const CouponHelper = require('../../../handlers/couponHelper');
const Transaction = require('../../../models/transactionModel');
const Booking = require('../../../models/bookTicketModel');
const PlatformConfig = require('../../../models/platformConfigModel');
const Trip = require('../../../models/tripModel');
const Seat = require('../../../models/seatsModel');
const smLedgerService = require('../../../services/smLedgerService');
const notificationController = require('../../../controllers/notificationController/notification_manager');

const patch = (obj, key, fn, restore) => {
  const old = obj[key];
  obj[key] = fn;
  restore.push(() => { obj[key] = old; });
};

const validUserId = '507f1f77bcf86cd799439012';
const validTripId = '507f1f77bcf86cd799439011';

test('Passenger Booking Confirmation Hardening Contracts', async (t) => {
  await t.test('prepareBooking with malformed seat selection returns 400 INVALID_SEAT_SELECTION', async () => {
    const restore = [];
    patch(Trip, 'findById', () => ({ select: () => ({ lean: async () => ({ status: 'scheduled' }) }) }), restore);
    try {
      const req = {
        body: { scheduleId: validTripId, seatNumbers: 'A1', originalAmount: 1000 },
        dbUser: { _id: validUserId },
      };
      let responseStatus, responseJson;
      const res = {
        status: (code) => {
          responseStatus = code;
          return { json: (data) => { responseJson = data; } };
        },
      };
      await prepareBooking(req, res, () => {});
      assert.equal(responseStatus, 400);
      assert.equal(responseJson.errorCode, 'INVALID_SEAT_SELECTION');
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('confirmBooking with invalid coupon returns 400 before payment or seat locking', async () => {
    const restore = [];
    patch(CouponHelper, 'validateCoupon', async () => ({ isValid: false, error: 'Expired' }), restore);
    try {
      const req = {
        body: { tempBookingId: 'BH1', gateway: 'esewa', paymentId: 'p1', paymentAmount: 1000, originalAmount: 1000, couponCode: 'BAD' },
        dbUser: { _id: validUserId },
        userInfo: { activeRole: 'passenger' },
        bookingHold: { tripId: validTripId, seatNumbers: ['a1'] },
      };
      let status, json;
      const res = { status: (c) => { status = c; return { json: (d) => { json = d; } }; } };
      await confirmBooking(req, res);
      assert.equal(status, 400);
      assert.equal(json.errorCode, 'COUPON_INVALID_DURING_CONFIRMATION');
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('confirmBooking with transaction SUCCESS transition failure returns 409 BOOKING_RECONCILIATION_REQUIRED', async () => {
    const restore = [];
    patch(PlatformConfig, 'getConfig', async () => ({ maxDiscountPercent: 80 }), restore);
    patch(CouponHelper, 'validateCoupon', async () => ({ isValid: true, discountAmount: 0, finalAmount: 1000, coupon: { _id: 'c1', couponCode: 'C' } }), restore);
    patch(Transaction, 'create', async () => ({ _id: 'txn1' }), restore);
    patch(Trip, 'findById', () => ({ select: () => ({ lean: async () => ({ status: 'scheduled' }) }), lean: async () => ({ status: 'scheduled' }) }), restore);
    patch(Seat, 'findOne', async () => ({ seata: [{ seatNo: 'A1', booked: false }], seatb: [], seatc: [] }), restore);
    patch(Seat, 'findOneAndUpdate', async () => ({ _id: 's1' }), restore);
    patch(Booking, 'create', async () => ({ _id: 'b1', ticketId: 'TKT1', status: 'confirmed' }), restore);
    patch(Transaction, 'findOneAndUpdate', async () => null, restore);

    try {
      const req = {
        body: { tempBookingId: 'BH1', gateway: 'esewa', paymentId: 'p1', paymentAmount: 1000, originalAmount: 1000 },
        dbUser: { _id: validUserId },
        userInfo: { activeRole: 'passenger' },
        bookingHold: { tripId: validTripId, seatNumbers: ['a1'] },
      };
      let status, json;
      const res = { status: (c) => { status = c; return { json: (d) => { json = d; } }; } };
      await confirmBooking(req, res);
      assert.equal(status, 409);
      assert.equal(json.errorCode, 'BOOKING_RECONCILIATION_REQUIRED');
      assert.equal(json.caseId, 'txn1');
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('confirmBooking with post-commit error returns 201 booking success response', async () => {
    const restore = [];
    patch(PlatformConfig, 'getConfig', async () => ({ maxDiscountPercent: 80 }), restore);
    patch(CouponHelper, 'validateCoupon', async () => ({ isValid: true, discountAmount: 0, finalAmount: 1000, coupon: { _id: 'c1', couponCode: 'C' } }), restore);
    patch(Transaction, 'create', async () => ({ _id: 'txn1' }), restore);
    patch(Trip, 'findById', () => ({ select: () => ({ lean: async () => ({ status: 'scheduled' }) }), lean: async () => ({ status: 'scheduled' }) }), restore);
    patch(Seat, 'findOne', async () => ({ seata: [{ seatNo: 'A1', booked: false }], seatb: [], seatc: [] }), restore);
    patch(Seat, 'findOneAndUpdate', async () => ({ _id: 's1' }), restore);
    patch(Booking, 'create', async () => ({ _id: 'b1', ticketId: 'TKT1', status: 'confirmed', seats: ['a1'], originalAmount: 1000, discountAmount: 0, totalAmount: 1000 }), restore);
    patch(Transaction, 'findOneAndUpdate', async () => ({ _id: 'txn1', status: 'SUCCESS' }), restore);
    patch(smLedgerService, 'generateCashback', async () => { throw new Error('Post-commit non-critical error'); }, restore);
    patch(notificationController, 'createLocalNotification', async () => {}, restore);

    try {
      const req = {
        body: { tempBookingId: 'BH1', gateway: 'esewa', paymentId: 'p1', paymentAmount: 1000, originalAmount: 1000, couponCode: 'C' },
        dbUser: { _id: validUserId },
        userInfo: { activeRole: 'passenger' },
        bookingHold: { tripId: validTripId, seatNumbers: ['a1'] },
      };
      let status, json;
      const res = { status: (c) => { status = c; return { json: (d) => { json = d; } }; } };
      await confirmBooking(req, res);
      assert.equal(status, 201);
      assert.equal(json.success, true);
      assert.ok(json.data.ticketId.startsWith('TKT-'));
    } finally { restore.reverse().forEach((f) => f()); }
  });
});
