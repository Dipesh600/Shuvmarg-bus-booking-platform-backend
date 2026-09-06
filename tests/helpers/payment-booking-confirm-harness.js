'use strict';
const notifModulePath = require.resolve('../../controllers/notificationController/notification_manager.js');
const userDeviceInfoPath = require.resolve('../../models/userDeviceInfoModel.js');
const esewaPath = require.resolve('../../services/esewaVerificationService.js');
const confirmationPath = require.resolve('../../src/modules/booking/booking-confirmation/booking-confirmation-notification.service.js');
const confirmationIndexPath = require.resolve('../../src/modules/booking/booking-confirmation');
const esewaVerificationIndexPath = require.resolve('../../src/modules/booking/passenger-esewa-verification');
const esewaVerificationServicePath = require.resolve('../../src/modules/booking/passenger-esewa-verification/passenger-esewa-verification.service.js');
const paymentTransactionIndexPath = require.resolve('../../src/modules/booking/passenger-booking-payment-transaction');
const paymentTransactionServicePath = require.resolve('../../src/modules/booking/passenger-booking-payment-transaction/passenger-booking-payment-transaction.service.js');
const paymentTransactionRepoPath = require.resolve('../../src/modules/booking/passenger-booking-payment-transaction/passenger-booking-payment-transaction.repository.js');
const tripValidationIndexPath = require.resolve('../../src/modules/booking/passenger-post-payment-trip-validation');
const tripValidationServicePath = require.resolve('../../src/modules/booking/passenger-post-payment-trip-validation/passenger-post-payment-trip-validation.service.js');
const seatCommitmentIndexPath = require.resolve('../../src/modules/booking/passenger-seat-commitment');
const seatCommitmentServicePath = require.resolve('../../src/modules/booking/passenger-seat-commitment/passenger-seat-commitment.service.js');
const bookingPersistenceIndexPath = require.resolve('../../src/modules/booking/passenger-booking-persistence');
const bookingPersistenceServicePath = require.resolve('../../src/modules/booking/passenger-booking-persistence/passenger-booking-persistence.service.js');
const reconciliationIndexPath = require.resolve('../../src/modules/booking/passenger-transaction-success-reconciliation');
const reconciliationServicePath = require.resolve('../../src/modules/booking/passenger-transaction-success-reconciliation/passenger-transaction-success-reconciliation.service.js');
const orchestratorPath = require.resolve('../../src/modules/booking/passenger-booking-confirmation-orchestrator');
const orchestratorDir = require('node:path').dirname(orchestratorPath);
const clearOrchestratorCache = () => Object.keys(require.cache)
  .filter(p => p.startsWith(orchestratorDir)).forEach(p => delete require.cache[p]);

const notifStub = { createLocalNotification: async () => {}, notificationManager: async () => {} };
const userDeviceInfoStub = { find: async () => [] };
const esewaStub = { verifyEsewaPayment: async (id, amt) => esewaStub._impl(id, amt), _impl: async () => ({ verified: true }), ESEWA_CONFIG: {} };
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
const smLedgerService = require('../../src/modules/wallet/sm-ledger');
const esewaService = require('../../services/esewaVerificationService.js');
const passengerSeatHold = require('../../src/modules/booking/passenger-seat-hold');

function setupConfirmHarness() {
  [notifModulePath, userDeviceInfoPath, esewaPath].forEach(p => { require.cache[p] = require.cache[p] || { id: p, filename: p, loaded: true, exports: p === notifModulePath ? notifStub : (p === userDeviceInfoPath ? userDeviceInfoStub : esewaStub) }; });

  [
    confirmationPath, confirmationIndexPath,
    esewaVerificationIndexPath, esewaVerificationServicePath,
    paymentTransactionIndexPath, paymentTransactionServicePath, paymentTransactionRepoPath,
    tripValidationIndexPath, tripValidationServicePath,
    seatCommitmentIndexPath, seatCommitmentServicePath,
    bookingPersistenceIndexPath, bookingPersistenceServicePath,
    reconciliationIndexPath, reconciliationServicePath
  ].forEach(p => delete require.cache[p]);

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
    wallet: { status: 'active' },
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
  mockMethod(require('../../src/modules/wallet/payment-authorization/wallet-pin.service'), 'verifyPaymentPin', async () => ({ ok: true }));
  esewaStub._impl = async () => ({ verified: true });
  mockMethod(bookingConfirmation, 'sendBookingConfirmedNotification', (...args) => {
    if (defaults.onNotifSent) defaults.onNotifSent(...args);
    return Promise.resolve();
  });
  clearOrchestratorCache();
  // This harness isolates orchestration. Real atomic persistence is exercised by database tests.
  mockMethod(require('../../src/shared/commit-payment-booking'), 'commitPaymentBooking', payload => Booking.create(payload));
  mockMethod(require('../../src/shared/rollback-unfulfilled-seat'), 'rollbackUnfulfilledSeat', ({ tripId, arrayField, seatNo, userId }) =>
    Seat.findOneAndUpdate({ tripId, [arrayField]: { $elemMatch: { seatNo, bookedBy: userId } } },
      { $set: { [`${arrayField}.$[elem].booked`]: false, [`${arrayField}.$[elem].bookedBy`]: null, [`${arrayField}.$[elem].bookedAt`]: null } },
      { arrayFilters: [{ 'elem.seatNo': seatNo, 'elem.bookedBy': userId }] }));
  const { confirmPassengerBooking: confirmBooking } = require('../../src/modules/booking/passenger-booking-confirmation-orchestrator');

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
  mockMethod(require('../../models/refundPolicyModel'), 'find', () => ({ sort: () => ({ lean: async () => [] }) }));
  mockMethod(Booking, 'create', () => Promise.resolve(defaults.booking));
  mockMethod(Wallet, 'findOne', () => Promise.resolve(defaults.wallet));
  mockMethod(SMLedger, 'updateOne', () => Promise.resolve());
  mockMethod(passengerSeatHold, 'completePassengerHold', () => Promise.resolve());
  mockMethod(passengerSeatHold, 'claimPassengerHoldForConfirmation', () => Promise.resolve(true));
  mockMethod(passengerSeatHold, 'restorePassengerHoldAfterFailedConfirmation', () => Promise.resolve());
  function restore() {
    patches.forEach(fn => fn());
    [
      notifModulePath, userDeviceInfoPath, esewaPath, confirmationPath, confirmationIndexPath,
      esewaVerificationIndexPath, esewaVerificationServicePath,
      paymentTransactionIndexPath, paymentTransactionServicePath, paymentTransactionRepoPath,
      tripValidationIndexPath, tripValidationServicePath,
      seatCommitmentIndexPath, seatCommitmentServicePath,
      bookingPersistenceIndexPath, bookingPersistenceServicePath,
      reconciliationIndexPath, reconciliationServicePath
    ].forEach(p => delete require.cache[p]);
    clearOrchestratorCache();
  }
  return {
    confirmBooking, mockMethod, defaults, restore, esewaStub, esewaService, notifStub,
    Transaction, Booking, PlatformConfig, Trip, Seat, Wallet, SMLedger, CouponHelper, smLedgerService, passengerSeatHold, bookingConfirmation
  };
}
function makeConfirmReq(body = {}) {
  return {
    body: { tempBookingId: 'BH1', gateway: 'esewa', paymentId: 'p1', paymentAmount: 1000, originalAmount: 1000, ...body },
    dbUser: { _id: '507f1f77bcf86cd799439012' },
    userInfo: { activeRole: 'passenger' },
    bookingHold: {
      _id: '507f1f77bcf86cd799439099',
      tripId: '507f1f77bcf86cd799439011',
      seatNumbers: ['a1'],
      originalAmount: 1000,
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
    }
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
