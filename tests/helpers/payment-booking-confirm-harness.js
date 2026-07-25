'use strict';
/**
 * tests/helpers/payment-booking-confirm-harness.js
 * Harness for confirmBooking characterization tests.
 */
const notifModulePath = require.resolve('../../controllers/notificationController/notification_manager.js');
const userDeviceInfoPath = require.resolve('../../models/userDeviceInfoModel.js');
const esewaPath = require.resolve('../../services/esewaVerificationService.js');
const confirmationPath = require.resolve('../../src/modules/booking/booking-confirmation/booking-confirmation-notification.service.js');
const confirmationIndexPath = require.resolve('../../src/modules/booking/booking-confirmation');
const controllerPath = require.resolve('../../controllers/ticketController/paymentBookingController.js');

const notifStub = {
  createLocalNotification: async () => {},
  notificationManager: async () => {}
};
const userDeviceInfoStub = { find: async () => [] };
const esewaStub = {
  verifyEsewaPayment: async (id, amt) => esewaStub._impl(id, amt),
  _impl: async () => ({ verified: true }),
  ESEWA_CONFIG: {}
};

require.cache[notifModulePath] = { id: notifModulePath, filename: notifModulePath, loaded: true, exports: notifStub, paths: [], children: [] };
require.cache[userDeviceInfoPath] = { id: userDeviceInfoPath, filename: userDeviceInfoPath, loaded: true, exports: userDeviceInfoStub };
require.cache[esewaPath] = { id: esewaPath, filename: esewaPath, loaded: true, exports: esewaStub, paths: [], children: [] };

const Transaction = require('../../models/transactionModel.js');
const Booking = require('../../models/bookTicketModel.js');
const PlatformConfig = require('../../models/platformConfigModel.js');
const Trip = require('../../models/tripModel.js');
const Seat = require('../../models/seatsModel.js');
const Wallet = require('../../models/walletModel.js');
const SMLedger = require('../../models/smLedgerModel.js');
const CouponHelper = require('../../handlers/couponHelper.js');
const smLedgerService = require('../../services/smLedgerService.js');
const esewaService = require('../../services/esewaVerificationService.js');
const passengerSeatHold = require('../../src/modules/booking/passenger-seat-hold');
const bcrypt = require('bcryptjs');

function setupConfirmHarness() {
  require.cache[notifModulePath] = { id: notifModulePath, filename: notifModulePath, loaded: true, exports: notifStub, paths: [], children: [] };
  require.cache[userDeviceInfoPath] = { id: userDeviceInfoPath, filename: userDeviceInfoPath, loaded: true, exports: userDeviceInfoStub };
  require.cache[esewaPath] = { id: esewaPath, filename: esewaPath, loaded: true, exports: esewaStub, paths: [], children: [] };

  delete require.cache[confirmationPath];
  delete require.cache[confirmationIndexPath];
  const bookingConfirmation = require('../../src/modules/booking/booking-confirmation');

  const defaults = {
    trip: { _id: '507f1f77bcf86cd799439011', status: 'scheduled', bookingClosesAt: null, brandId: 'b1', busId: 'bus1' },
    seatDoc: { seata: [{ seatNo: 'A1', booked: false }], seatb: [], seatc: [] },
    couponValidation: { isValid: true, discountAmount: 0, finalAmount: 1000, coupon: { _id: 'c1', couponCode: 'SAVE' } },
    spendableBalance: { display: 1000 },
    smConfig: { maxDiscountPercent: 80 },
    debitEntry: { _id: 'debit-123' },
    transaction: { _id: '507f1f77bcf86cd799439011', status: 'PAYMENT_RECEIVED', totalAmount: 1000, transactionId: 'p1', userId: '507f1f77bcf86cd799439012', tripId: '507f1f77bcf86cd799439011', seats: ['a1'] },
    booking: [{ _id: '507f1f77bcf86cd799439033', ticketId: 'TKT1' }],
    wallet: { status: 'active', isPinSet: true, pin: '$2a$10$hashedpin' },
    pinMatch: true,
    onNotifSent: null
  };

  const patches = [];
  function mockMethod(obj, key, fn) {
    const orig = obj[key];
    obj[key] = fn;
    patches.push(() => {
      if (orig === undefined) delete obj[key];
      else obj[key] = orig;
    });
  }

  esewaStub._impl = async () => ({ verified: true });
  mockMethod(bookingConfirmation, 'sendBookingConfirmedNotification', (...args) => {
    if (defaults.onNotifSent) defaults.onNotifSent(...args);
    return Promise.resolve();
  });

  delete require.cache[controllerPath];
  const { confirmBooking } = require('../../controllers/ticketController/paymentBookingController.js');

  mockMethod(Trip, 'findById', () => ({ lean: () => Promise.resolve(defaults.trip) }));
  mockMethod(Seat, 'findOne', () => Promise.resolve(defaults.seatDoc));
  mockMethod(Seat, 'findOneAndUpdate', () => Promise.resolve({ _id: 'seat-doc' }));
  mockMethod(CouponHelper, 'validateCoupon', () => Promise.resolve(defaults.couponValidation));
  mockMethod(CouponHelper, 'applyCoupon', () => Promise.resolve());
  mockMethod(smLedgerService, 'computeSpendableBalance', () => Promise.resolve(defaults.spendableBalance));
  mockMethod(smLedgerService, 'debitLedgerFIFO', () => Promise.resolve(defaults.debitEntry));
  mockMethod(smLedgerService, 'reverseDebit', () => Promise.resolve());
  mockMethod(smLedgerService, 'generateCashback', () => Promise.resolve({}));
  mockMethod(PlatformConfig, 'getConfig', () => Promise.resolve(defaults.smConfig));
  mockMethod(Transaction, 'create', () => Promise.resolve(defaults.transaction));
  mockMethod(Transaction, 'findByIdAndUpdate', () => Promise.resolve(defaults.transaction));
  mockMethod(Transaction, 'findOneAndUpdate', () => Promise.resolve({ ...defaults.transaction, status: 'SUCCESS' }));
  mockMethod(Booking, 'create', () => Promise.resolve(defaults.booking));
  mockMethod(Wallet, 'findOne', () => Promise.resolve(defaults.wallet));
  mockMethod(SMLedger, 'updateOne', () => Promise.resolve());
  mockMethod(bcrypt, 'compare', () => Promise.resolve(defaults.pinMatch));
  mockMethod(passengerSeatHold, 'completePassengerHold', () => Promise.resolve());

  function restore() {
    patches.forEach(fn => fn());
    delete require.cache[notifModulePath];
    delete require.cache[userDeviceInfoPath];
    delete require.cache[esewaPath];
    delete require.cache[confirmationPath];
    delete require.cache[confirmationIndexPath];
    delete require.cache[controllerPath];
  }

  return {
    confirmBooking, mockMethod, defaults, restore, esewaStub, esewaService, notifStub,
    Transaction, Booking, PlatformConfig, Trip, Seat, Wallet, SMLedger, CouponHelper, smLedgerService, passengerSeatHold, bookingConfirmation, bcrypt
  };
}

function makeConfirmReq(body = {}) {
  return {
    body: { tempBookingId: 'BH1', gateway: 'esewa', paymentId: 'p1', paymentAmount: 1000, originalAmount: 1000, ...body },
    dbUser: { _id: '507f1f77bcf86cd799439012' },
    userInfo: { activeRole: 'passenger' },
    bookingHold: { _id: '507f1f77bcf86cd799439099', tripId: '507f1f77bcf86cd799439011', seatNumbers: ['a1'] }
  };
}

function makeMockConfirmRes() {
  let _status, _json, _sent = false;
  return {
    get headersSent() { return _sent; },
    status(code) { if (!_sent) _status = code; return { json(data) { if (!_sent) { _json = data; _sent = true; } } }; },
    json(data) { if (!_sent) { _json = data; _sent = true; } },
    getStatus: () => _status,
    getJson: () => _json
  };
}

module.exports = { setupConfirmHarness, makeConfirmReq, makeMockConfirmRes };
