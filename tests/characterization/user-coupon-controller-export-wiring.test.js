'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const userCouponController = require('../../controllers/couponController/userCouponController.js');
const catalogModule = require('../../src/modules/coupon/catalog');

test('User Coupon Controller Export Wiring Characterization', async (t) => {
  await t.test('Legacy controller exports all 7 expected handlers', () => {
    assert.equal(typeof userCouponController.getAvailableCoupons, 'function');
    assert.equal(typeof userCouponController.validateCoupon, 'function');
    assert.equal(typeof userCouponController.getMyCouponUsage, 'function');
    assert.equal(typeof userCouponController.getBestCoupon, 'function');
    assert.equal(typeof userCouponController.searchCoupons, 'function');
    assert.equal(typeof userCouponController.getAllCouponsForUser, 'function');
    assert.equal(typeof userCouponController.getAllCouponsIncludingExpired, 'function');
  });

  await t.test('Extracted catalog handlers match catalog module exports', () => {
    assert.equal(
      userCouponController.getAllCouponsForUser,
      catalogModule.getAllCouponsForUser
    );
    assert.equal(
      userCouponController.getAllCouponsIncludingExpired,
      catalogModule.getAllCouponsIncludingExpired
    );
  });
});
