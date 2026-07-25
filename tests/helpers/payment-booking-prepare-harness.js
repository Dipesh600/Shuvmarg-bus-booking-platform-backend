'use strict';
/**
 * tests/helpers/payment-booking-prepare-harness.js
 * Harness for prepareBooking characterization tests.
 */
const Seat = require('../../models/seatsModel.js');
const Trip = require('../../models/tripModel.js');
const PlatformConfig = require('../../models/platformConfigModel.js');
const CouponHelper = require('../../handlers/couponHelper.js');
const passengerSeatHold = require('../../src/modules/booking/passenger-seat-hold');
const smLedgerService = require('../../services/smLedgerService.js');
const controllerPath = require.resolve('../../controllers/ticketController/paymentBookingController.js');

function setupPrepareHarness() {
  const patches = [];
  function mockMethod(obj, key, fn) {
    const orig = obj[key];
    obj[key] = fn;
    patches.push(() => {
      if (orig === undefined) {
        delete obj[key];
      } else {
        obj[key] = orig;
      }
    });
  }

  function installSeatNormalizationSeam() {
    mockMethod(passengerSeatHold, 'normalizeSeatNumbers', (seats) => (Array.isArray(seats) ? seats.map(s => String(s).toLowerCase()) : seats));
  }

  delete require.cache[controllerPath];
  const { prepareBooking } = require('../../controllers/ticketController/paymentBookingController.js');

  const defaults = {
    trip: { _id: '507f1f77bcf86cd799439011', status: 'scheduled', bookingClosesAt: null },
    seatDoc: { seata: [{ seatNo: 'A1', booked: false }], seatb: [], seatc: [] },
    couponValidation: { isValid: true, discountAmount: 0, finalAmount: 100, coupon: { _id: 'c1', couponCode: 'SAVE10', title: 'Save', discountType: 'fixed', discountValue: 10 } },
    spendableBalance: { display: 1000 },
    smConfig: { maxDiscountPercent: 80 },
    hold: { tempBookingId: 'TB1', seatNumbers: ['a1'], expiresAt: new Date('2026-12-31') }
  };

  mockMethod(Trip, 'findById', () => ({
    select: () => ({ lean: () => Promise.resolve(defaults.trip) }),
    lean: () => Promise.resolve(defaults.trip)
  }));
  mockMethod(Seat, 'findOne', () => Promise.resolve(defaults.seatDoc));
  mockMethod(CouponHelper, 'validateCoupon', () => Promise.resolve(defaults.couponValidation));
  mockMethod(smLedgerService, 'computeSpendableBalance', () => Promise.resolve(defaults.spendableBalance));
  mockMethod(PlatformConfig, 'getConfig', () => Promise.resolve(defaults.smConfig));
  mockMethod(passengerSeatHold, 'createOrReusePassengerSeatHold', () => Promise.resolve(defaults.hold));

  function restore() {
    patches.forEach(fn => fn());
    delete require.cache[controllerPath];
  }

  return { prepareBooking, mockMethod, defaults, restore, installSeatNormalizationSeam, Trip, Seat, CouponHelper, smLedgerService, PlatformConfig, passengerSeatHold };
}

function makePrepareReq(body = {}) {
  return {
    body,
    dbUser: { _id: '507f1f77bcf86cd799439012' },
    userInfo: { activeRole: 'passenger' }
  };
}

function makeMockRes() {
  let _status, _json, _nextErr;
  const res = {
    status(code) { _status = code; return res; },
    json(data) { _json = data; return res; },
  };
  const next = (err) => { _nextErr = err; };
  return { res, next, getStatus: () => _status, getJson: () => _json, getNextErr: () => _nextErr };
}

module.exports = { setupPrepareHarness, makePrepareReq, makeMockRes };
