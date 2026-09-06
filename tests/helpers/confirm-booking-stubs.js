'use strict';
/**
 * tests/helpers/confirm-booking-stubs.js
 *
 * Shared stub infrastructure for confirmBooking unit tests.
 * Required BEFORE the controller so the notification/device mocks land in
 * the require cache first.
 */

// ── Notification module stub ──────────────────────────────────────────────────
const notifModulePath      = require.resolve('../../controllers/notificationController/notification_manager.js');
const userDeviceInfoPath   = require.resolve('../../models/userDeviceInfoModel.js');
const esewaVerificationPath = require.resolve(
  '../../src/modules/booking/passenger-esewa-verification'
);

const notifStub = {
  _shouldThrow: false,
  _callCount:   0,
  createLocalNotification: async function () {
    notifStub._callCount++;
    if (notifStub._shouldThrow) throw new Error('Notif err');
  },
  notificationManager: async () => {},
};
const userDeviceInfoStub = { find: async () => [] };

require.cache[notifModulePath] = {
  id: notifModulePath, filename: notifModulePath, loaded: true,
  exports: notifStub, paths: [], children: [],
};
require.cache[userDeviceInfoPath] = {
  id: userDeviceInfoPath, filename: userDeviceInfoPath, loaded: true,
  exports: userDeviceInfoStub,
};
require.cache[esewaVerificationPath] = {
  id: esewaVerificationPath,
  filename: esewaVerificationPath,
  loaded: true,
  exports: {
    verifyPassengerEsewaPayment: async () => ({
      ok: true, applied: true, verified: true,
    }),
  },
};

// Load controller AFTER stubs are registered
// Atomic persistence has separate real-database coverage; this suite isolates orchestration.
const atomicCommit = require('../../src/shared/commit-payment-booking');
const originalCommit = atomicCommit.commitPaymentBooking;
atomicCommit.commitPaymentBooking = payload => require('../../models/bookTicketModel').create(payload);
const snapshotModule = require('../../src/shared/refund-policy-snapshot');
const originalSnapshot = snapshotModule.captureRefundPolicySnapshot;
snapshotModule.captureRefundPolicySnapshot = async () => ({ version: 1, rules: [] });
const controllerPath = require.resolve('../../src/modules/booking/passenger-booking-confirmation-orchestrator');
delete require.cache[controllerPath];
const { confirmPassengerBooking: confirmBooking } = require('../../src/modules/booking/passenger-booking-confirmation-orchestrator');

// ── Dependencies ──────────────────────────────────────────────────────────────
const Transaction       = require('../../models/transactionModel');
const Booking           = require('../../models/bookTicketModel');
const PlatformConfig    = require('../../models/platformConfigModel');
const Trip              = require('../../models/tripModel');
const Seat              = require('../../models/seatsModel');
const smLedgerService   = require('../../src/modules/wallet/sm-ledger');
const passengerSeatHold = require('../../src/modules/booking/passenger-seat-hold');

// ── Patch helpers ─────────────────────────────────────────────────────────────
let _stack = [];
const patch      = (obj, key, fn) => { const o = obj[key]; obj[key] = fn; _stack.push(() => { obj[key] = o; }); };
const restoreAll = () => _stack.splice(0).reverse().forEach(f => f());

const patchHappyPath = () => {
  patch(PlatformConfig, 'getConfig', async () => ({ maxDiscountPercent: 80 }));
  patch(Transaction, 'create', async () => ({ _id: '507f1f77bcf86cd799439011' }));
  patch(Trip, 'findById', () => ({
    select: () => ({ lean: async () => ({ status: 'scheduled' }) }),
    lean:   async () => ({ status: 'scheduled' }),
  }));
  patch(Seat, 'findOne', async () => ({ seata: [{ seatNo: 'A1', booked: false }], seatb: [], seatc: [] }));
  patch(Seat, 'findOneAndUpdate', async () => ({ _id: 'seat-doc' }));
  patch(Booking, 'create', async () => ({ _id: '507f1f77bcf86cd799439033', ticketId: 'TKT1', seats: ['a1'] }));
  patch(Transaction, 'findOneAndUpdate', async () => ({ _id: '507f1f77bcf86cd799439011', status: 'SUCCESS' }));
  patch(passengerSeatHold, 'completePassengerHold', async () => {});
  patch(passengerSeatHold, 'claimPassengerHoldForConfirmation', async () => true);
  patch(passengerSeatHold, 'restorePassengerHoldAfterFailedConfirmation', async () => {});
  patch(smLedgerService, 'generateCashback', async () => ({}));
};

// ── Request / response fakes ──────────────────────────────────────────────────
const makeReq = () => ({
  body: { tempBookingId: 'BH1', gateway: 'esewa', paymentId: 'p1', paymentAmount: 1000, originalAmount: 1000 },
  dbUser:      { _id: '507f1f77bcf86cd799439012' },
  userInfo:    { activeRole: 'passenger' },
  bookingHold: {
    _id: '507f1f77bcf86cd799439099',
    tripId: '507f1f77bcf86cd799439011',
    seatNumbers: ['a1'],
    originalAmount: 1000,
  },
});

// Captures the FIRST status()+json() call; sets headersSent=true after so the
// outer-catch guard skips subsequent calls.
const makeRes = () => {
  let _status, _body, _sent = false;
  return {
    get headersSent() { return _sent; },
    status(code)  { if (!_sent) _status = code; return { json(d) { if (!_sent) { _body = d; _sent = true; } } }; },
    getStatus()   { return _status; },
    getBody()     { return _body; },
  };
};

// ── Cleanup ───────────────────────────────────────────────────────────────────
const teardown = () => {
  atomicCommit.commitPaymentBooking = originalCommit;
  snapshotModule.captureRefundPolicySnapshot = originalSnapshot;
  delete require.cache[notifModulePath];
  delete require.cache[userDeviceInfoPath];
  delete require.cache[esewaVerificationPath];
};

module.exports = {
  confirmBooking, notifStub, notifModulePath, userDeviceInfoPath,
  Transaction, Booking, PlatformConfig, Trip, Seat, smLedgerService, passengerSeatHold,
  patch, restoreAll, patchHappyPath, makeReq, makeRes, teardown,
  VALID_USER_ID:  '507f1f77bcf86cd799439012',
  VALID_HOLD_ID:  '507f1f77bcf86cd799439099',
};
