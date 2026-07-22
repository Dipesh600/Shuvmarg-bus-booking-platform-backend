'use strict';

/**
 * tests/unit/booking/confirm-booking-hardening.test.js
 * Unit tests for confirmBooking: gateway allow-list, transaction reconciliation, hold completion, post-commit isolation.
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
const passengerSeatHold = require('../../../src/modules/booking/passenger-seat-hold');
const notificationController = require('../../../controllers/notificationController/notification_manager');

const patch = (obj, key, fn, restore) => {
  const old = obj[key];
  obj[key] = fn;
  restore.push(() => { obj[key] = old; });
};

const validUserId = '507f1f77bcf86cd799439012';
const validTripId = '507f1f77bcf86cd799439011';
const validHoldId = '507f1f77bcf86cd799439099';

test('Passenger Booking Confirmation Hardening Contracts', async (t) => {
  await t.test('1. unsupported gateway returns 400 UNSUPPORTED_PAYMENT_GATEWAY before side effects', async () => {
    let sideEffectsCalled = false;
    const restore = [];
    patch(CouponHelper, 'validateCoupon', async () => { sideEffectsCalled = true; return { isValid: true }; }, restore);
    try {
      const req = { body: { tempBookingId: 'BH1', gateway: 'cash', paymentAmount: 1000, originalAmount: 1000 }, dbUser: { _id: validUserId } };
      let status, json;
      const res = { status: (c) => { status = c; return { json: (d) => { json = d; } }; } };
      await confirmBooking(req, res);
      assert.equal(status, 400);
      assert.equal(json.errorCode, 'UNSUPPORTED_PAYMENT_GATEWAY');
      assert.equal(sideEffectsCalled, false);
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('2 & 3. transaction SUCCESS null or throw returns 409 BOOKING_RECONCILIATION_REQUIRED', async () => {
    const restore = [];
    patch(PlatformConfig, 'getConfig', async () => ({ maxDiscountPercent: 80 }), restore);
    patch(Transaction, 'create', async () => ({ _id: '507f1f77bcf86cd799439011' }), restore);
    patch(Trip, 'findById', () => ({ select: () => ({ lean: async () => ({ status: 'scheduled' }) }), lean: async () => ({ status: 'scheduled' }) }), restore);
    patch(Seat, 'findOne', async () => ({ seata: [{ seatNo: 'A1', booked: false }], seatb: [], seatc: [] }), restore);
    patch(Seat, 'findOneAndUpdate', async () => ({ _id: '507f1f77bcf86cd799439022' }), restore);
    patch(Booking, 'create', async () => ({ _id: '507f1f77bcf86cd799439033', ticketId: 'TKT1' }), restore);
    patch(Transaction, 'findOneAndUpdate', async () => null, restore);

    try {
      const req = { body: { tempBookingId: 'BH1', gateway: 'esewa', paymentId: 'p1', paymentAmount: 1000, originalAmount: 1000 }, dbUser: { _id: validUserId }, userInfo: { activeRole: 'passenger' }, bookingHold: { _id: validHoldId, tripId: validTripId, seatNumbers: ['a1'] } };
      let status, json;
      const res = { status: (c) => { status = c; return { json: (d) => { json = d; } }; } };
      await confirmBooking(req, res);
      assert.equal(status, 409);
      assert.equal(json.errorCode, 'BOOKING_RECONCILIATION_REQUIRED');
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('4. successful confirmation completes hold with req.bookingHold._id and req.dbUser._id', async () => {
    let completedParams = null;
    const restore = [];
    patch(PlatformConfig, 'getConfig', async () => ({ maxDiscountPercent: 80 }), restore);
    patch(Transaction, 'create', async () => ({ _id: '507f1f77bcf86cd799439011' }), restore);
    patch(Trip, 'findById', () => ({ select: () => ({ lean: async () => ({ status: 'scheduled' }) }), lean: async () => ({ status: 'scheduled' }) }), restore);
    patch(Seat, 'findOne', async () => ({ seata: [{ seatNo: 'A1', booked: false }], seatb: [], seatc: [] }), restore);
    patch(Seat, 'findOneAndUpdate', async () => ({ _id: '507f1f77bcf86cd799439022' }), restore);
    patch(Booking, 'create', async () => ({ _id: '507f1f77bcf86cd799439033', ticketId: 'TKT1', seats: ['a1'] }), restore);
    patch(Transaction, 'findOneAndUpdate', async () => ({ _id: '507f1f77bcf86cd799439011', status: 'SUCCESS' }), restore);
    patch(passengerSeatHold, 'completePassengerHold', async (params) => { completedParams = params; }, restore);

    try {
      const req = { body: { tempBookingId: 'BH1', gateway: 'esewa', paymentId: 'p1', paymentAmount: 1000, originalAmount: 1000 }, dbUser: { _id: validUserId }, userInfo: { activeRole: 'passenger' }, bookingHold: { _id: validHoldId, tripId: validTripId, seatNumbers: ['a1'] } };
      let status;
      const res = { status: (c) => { status = c; return { json: () => {} }; } };
      await confirmBooking(req, res);
      assert.equal(status, 201);
      assert.equal(String(completedParams.holdId), validHoldId);
      assert.equal(String(completedParams.userId), validUserId);
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('5, 6, 7 & 8. hold completion, notification or cashback post-commit failures return 201', async () => {
    const restore = [];
    patch(PlatformConfig, 'getConfig', async () => ({ maxDiscountPercent: 80 }), restore);
    patch(Transaction, 'create', async () => ({ _id: '507f1f77bcf86cd799439011' }), restore);
    patch(Trip, 'findById', () => ({ select: () => ({ lean: async () => ({ status: 'scheduled' }) }), lean: async () => ({ status: 'scheduled' }) }), restore);
    patch(Seat, 'findOne', async () => ({ seata: [{ seatNo: 'A1', booked: false }], seatb: [], seatc: [] }), restore);
    patch(Seat, 'findOneAndUpdate', async () => ({ _id: '507f1f77bcf86cd799439022' }), restore);
    patch(Booking, 'create', async () => ({ _id: '507f1f77bcf86cd799439033', ticketId: 'TKT1', seats: ['a1'] }), restore);
    patch(Transaction, 'findOneAndUpdate', async () => ({ _id: '507f1f77bcf86cd799439011', status: 'SUCCESS' }), restore);
    patch(passengerSeatHold, 'completePassengerHold', async () => { throw new Error('Hold err'); }, restore);
    patch(smLedgerService, 'generateCashback', async () => { throw new Error('Cashback err'); }, restore);
    patch(notificationController, 'createLocalNotification', async () => { throw new Error('Notif err'); }, restore);

    try {
      const req = { body: { tempBookingId: 'BH1', gateway: 'esewa', paymentId: 'p1', paymentAmount: 1000, originalAmount: 1000 }, dbUser: { _id: validUserId }, userInfo: { activeRole: 'passenger' }, bookingHold: { _id: validHoldId, tripId: validTripId, seatNumbers: ['a1'] } };
      let status, json;
      const res = { status: (c) => { status = c; return { json: (d) => { json = d; } }; } };
      await confirmBooking(req, res);
      assert.equal(status, 201);
      assert.equal(json.success, true);
    } finally { restore.reverse().forEach((f) => f()); }
  });

  await t.test('9. pre-booking unexpected failure triggers compensation and returns 500', async () => {
    const restore = [];
    patch(PlatformConfig, 'getConfig', async () => ({ maxDiscountPercent: 80 }), restore);
    patch(Transaction, 'create', async () => ({ _id: '507f1f77bcf86cd799439011' }), restore);
    patch(Trip, 'findById', () => ({ select: () => ({ lean: async () => { throw new Error('DB crash'); } }), lean: async () => { throw new Error('DB crash'); } }), restore);
    patch(Transaction, 'findByIdAndUpdate', async () => {}, restore);

    try {
      const req = { body: { tempBookingId: 'BH1', gateway: 'esewa', paymentId: 'p1', paymentAmount: 1000, originalAmount: 1000 }, dbUser: { _id: validUserId }, userInfo: { activeRole: 'passenger' }, bookingHold: { _id: validHoldId, tripId: validTripId, seatNumbers: ['a1'] } };
      let status, json;
      const res = { status: (c) => { status = c; return { json: (d) => { json = d; } }; } };
      await confirmBooking(req, res);
      assert.equal(status, 500);
      assert.equal(json.errorCode, 'BOOKING_CREATION_FAILED_PAYMENT_RECEIVED');
    } finally { restore.reverse().forEach((f) => f()); }
  });
});
