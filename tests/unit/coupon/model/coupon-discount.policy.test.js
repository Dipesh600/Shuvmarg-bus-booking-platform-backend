'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculateCouponDiscount,
} = require('../../../../src/modules/coupon/model/coupon-discount.policy.js');

test('Coupon Discount Policy Unit Tests', async (t) => {
  await t.test('Returns 0 if coupon isCurrentlyValid is false', () => {
    const coupon = { isCurrentlyValid: false, minOrderAmount: 0, discountType: 'fixed', discountValue: 50 };
    assert.equal(calculateCouponDiscount(coupon, 100), 0);
  });

  await t.test('Returns 0 if orderAmount is below minOrderAmount', () => {
    const coupon = { isCurrentlyValid: true, minOrderAmount: 500, discountType: 'fixed', discountValue: 50 };
    assert.equal(calculateCouponDiscount(coupon, 499), 0);
  });

  await t.test('Calculates percentage discount correctly', () => {
    const coupon = { isCurrentlyValid: true, minOrderAmount: 100, discountType: 'percentage', discountValue: 15 };
    assert.equal(calculateCouponDiscount(coupon, 200), 30);
  });

  await t.test('Calculates fixed discount correctly', () => {
    const coupon = { isCurrentlyValid: true, minOrderAmount: 100, discountType: 'fixed', discountValue: 50 };
    assert.equal(calculateCouponDiscount(coupon, 200), 50);
  });

  await t.test('Caps discount at maxDiscountAmount when set', () => {
    const coupon = {
      isCurrentlyValid: true,
      minOrderAmount: 100,
      discountType: 'percentage',
      discountValue: 50,
      maxDiscountAmount: 40,
    };
    assert.equal(calculateCouponDiscount(coupon, 200), 40);
  });

  await t.test('maxDiscountAmount: 0 preserves truthy-check behavior (does not cap)', () => {
    const coupon = {
      isCurrentlyValid: true,
      minOrderAmount: 100,
      discountType: 'fixed',
      discountValue: 50,
      maxDiscountAmount: 0,
    };
    assert.equal(calculateCouponDiscount(coupon, 200), 50);
  });

  await t.test('Caps discount at orderAmount if discount exceeds orderAmount', () => {
    const coupon = { isCurrentlyValid: true, minOrderAmount: 0, discountType: 'fixed', discountValue: 500 };
    assert.equal(calculateCouponDiscount(coupon, 100), 100);
  });

  await t.test('Rounds discount to two decimal places', () => {
    const coupon = { isCurrentlyValid: true, minOrderAmount: 0, discountType: 'percentage', discountValue: 15.555 };
    // 100 * 15.555 / 100 = 15.555 -> 15.56
    assert.equal(calculateCouponDiscount(coupon, 100), 15.56);
  });

  await t.test('Unknown discount type leaves discountAmount as 0', () => {
    const coupon = { isCurrentlyValid: true, minOrderAmount: 0, discountType: 'unknown_type', discountValue: 100 };
    assert.equal(calculateCouponDiscount(coupon, 200), 0);
  });
});
