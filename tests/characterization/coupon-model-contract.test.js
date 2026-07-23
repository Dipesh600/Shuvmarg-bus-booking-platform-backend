'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Coupon = require('../../models/couponModel.js');

test('Coupon Model Contract Characterization Test', async (t) => {
  await t.test('Model export & schema metadata', () => {
    assert.equal(Coupon.modelName, 'Coupon');
    assert.equal(Coupon.schema.options.timestamps, true);
    assert.equal(typeof Coupon.schema.methods.calculateDiscount, 'function');
    assert.equal(typeof Coupon.schema.statics.findActiveCoupons, 'function');
    assert.ok(Coupon.schema.virtuals.isCurrentlyValid);
  });

  await t.test('Indexes remain intact', () => {
    const indexes = Coupon.schema.indexes();
    const indexFields = indexes.map(([fields]) => Object.keys(fields).join(','));

    assert.ok(indexFields.includes('couponCode'));
    assert.ok(indexFields.includes('isActive,validFrom,validTo'));
    assert.ok(indexFields.includes('createdBy'));
  });

  await t.test('Nested designConfig schema paths, defaults, and enums', () => {
    const paths = Coupon.schema.paths;

    // Edges
    ['top', 'bottom', 'left', 'right'].forEach((edge) => {
      const pathObj = paths[`designConfig.edges.${edge}`];
      assert.ok(pathObj, `Missing designConfig.edges.${edge}`);
      assert.equal(pathObj.defaultValue, 'smooth');
      assert.deepEqual(pathObj.enumValues, ['smooth', 'ticket', 'torn', 'jagged']);
    });

    // Typography
    ['titleAlignment', 'descAlignment', 'codeAlignment'].forEach((align) => {
      const pathObj = paths[`designConfig.typography.${align}`];
      assert.ok(pathObj, `Missing designConfig.typography.${align}`);
      assert.equal(pathObj.defaultValue, 'left');
      assert.deepEqual(pathObj.enumValues, ['left', 'center', 'right']);
    });

    // ImageConfig
    assert.equal(paths['designConfig.imageConfig.scale'].defaultValue, 100);
    assert.equal(paths['designConfig.imageConfig.offsetX'].defaultValue, 0);
    assert.equal(paths['designConfig.imageConfig.offsetY'].defaultValue, 0);
    assert.equal(paths['designConfig.imageConfig.fit'].defaultValue, 'contain');
    assert.deepEqual(paths['designConfig.imageConfig.fit'].enumValues, ['cover', 'contain', 'fill']);
  });

  await t.test('Model instance calculates percentage and fixed discounts without MongoDB', () => {
    const validFrom = new Date(Date.now() - 3600000);
    const validTo = new Date(Date.now() + 3600000);

    const percentageDoc = new Coupon({
      couponCode: 'PERC20',
      title: '20 Percent Off',
      discountType: 'percentage',
      discountValue: 20,
      minOrderAmount: 100,
      validFrom,
      validTo,
      createdBy: '507f1f77bcf86cd799439011',
    });

    assert.equal(percentageDoc.calculateDiscount(500), 100);

    const fixedDoc = new Coupon({
      couponCode: 'FIX50',
      title: '50 Off',
      discountType: 'fixed',
      discountValue: 50,
      minOrderAmount: 100,
      validFrom,
      validTo,
      createdBy: '507f1f77bcf86cd799439011',
    });

    assert.equal(fixedDoc.calculateDiscount(500), 50);
  });
});
