'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveCouponImageUrl,
} = require('../../../../src/modules/coupon/catalog/coupon-image-url.service.js');
const {
  mapActiveCoupon,
  mapCouponIncludingStatus,
  mapActiveCouponList,
  mapCouponListIncludingStatus,
} = require('../../../../src/modules/coupon/catalog/coupon-catalog.mapper.js');

test('Coupon Catalog Image URL Service & Mapper Contracts', async (t) => {
  await t.test('Image-Service: raw S3 key is sent to getDisplayUrl', async () => {
    let keySent = null;
    const url = await resolveCouponImageUrl('platform/coupons/img.png', {
      getDisplayUrl: (key) => { keySent = key; return `https://signed/${key}`; },
    });
    assert.equal(keySent, 'platform/coupons/img.png');
    assert.equal(url, 'https://signed/platform/coupons/img.png');
  });

  await t.test('Image-Service: legacy full URL is stripped to pathname key', async () => {
    let keySent = null;
    const url = await resolveCouponImageUrl('https://s3.amazonaws.com/platform/coupons/img.png', {
      getDisplayUrl: (key) => { keySent = key; return `https://signed/${key}`; },
    });
    assert.equal(keySent, 'platform/coupons/img.png');
    assert.equal(url, 'https://signed/platform/coupons/img.png');
  });

  await t.test('Image-Service: malformed HTTP URL returns null', async () => {
    let getDisplayCalled = false;
    const url = await resolveCouponImageUrl('http://invalid url', {
      getDisplayUrl: () => { getDisplayCalled = true; },
    });
    assert.equal(url, null);
    assert.equal(getDisplayCalled, false);
  });

  await t.test('Image-Service: missing or empty image returns null', async () => {
    assert.equal(await resolveCouponImageUrl(null), null);
    assert.equal(await resolveCouponImageUrl(''), null);
    assert.equal(await resolveCouponImageUrl(undefined), null);
  });

  await t.test('Image-Service: getDisplayUrl errors propagate directly', async () => {
    const s3Error = new Error('S3 signature failure');
    await assert.rejects(
      async () => resolveCouponImageUrl('key', { getDisplayUrl: () => { throw s3Error; } }),
      (err) => err === s3Error
    );
  });

  await t.test('Mapper: active coupon excludes isActive and maps all exact fields', async () => {
    const coupon = {
      _id: 'c1',
      couponCode: 'SAVE10',
      title: 'Save 10%',
      description: 'Desc',
      category: 'BUS',
      imageUrl: 'key.png',
      designConfig: { color: 'blue' },
      discountType: 'percentage',
      discountValue: 10,
      minOrderAmount: 100,
      maxDiscountAmount: 50,
      validFrom: new Date('2026-01-01'),
      validTo: new Date('2026-12-31'),
      perUserLimit: 1,
      isActive: true,
    };

    const result = await mapActiveCoupon(coupon, async (url) => `signed_${url}`);

    assert.equal('isActive' in result, false);
    assert.equal(result.imageUrl, 'signed_key.png');
    assert.equal(result.couponCode, 'SAVE10');
    assert.equal(result.title, 'Save 10%');
    assert.equal(result.category, 'BUS');
    assert.equal(result.perUserLimit, 1);
  });

  await t.test('Mapper: combined coupon includes isActive', async () => {
    const coupon = {
      _id: 'c2',
      couponCode: 'EXPIRED10',
      imageUrl: 'key2.png',
      isActive: false,
    };

    const result = await mapCouponIncludingStatus(coupon, async (url) => `signed_${url}`);
    assert.equal(result.isActive, false);
    assert.equal(result.imageUrl, 'signed_key2.png');
  });

  await t.test('Mapper: list mappers process array in parallel', async () => {
    const coupons = [{ _id: 'c1', imageUrl: 'k1' }, { _id: 'c2', imageUrl: 'k2' }];
    const activeList = await mapActiveCouponList(coupons, async (u) => `s_${u}`);
    const combinedList = await mapCouponListIncludingStatus(coupons, async (u) => `s_${u}`);

    assert.equal(activeList.length, 2);
    assert.equal(combinedList.length, 2);
  });
});
