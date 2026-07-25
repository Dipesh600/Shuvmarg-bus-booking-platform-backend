'use strict';
/**
 * tests/characterization/payment-booking-prepare-harness-contract.test.js
 * Contract tests for prepareBooking characterization harness and normalization seam.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { setupPrepareHarness } = require('../helpers/payment-booking-prepare-harness.js');

test('prepareBooking harness contract characterization', async (t) => {
  await t.test('1. Base setup does not expose normalizeSeatNumbers on passengerSeatHold', () => {
    const h = setupPrepareHarness();
    try {
      assert.equal(typeof h.passengerSeatHold.normalizeSeatNumbers, 'undefined');
    } finally {
      h.restore();
    }
  });

  await t.test('2. installSeatNormalizationSeam adds normalizeSeatNumbers function', () => {
    const h = setupPrepareHarness();
    try {
      h.installSeatNormalizationSeam();
      assert.equal(typeof h.passengerSeatHold.normalizeSeatNumbers, 'function');
    } finally {
      h.restore();
    }
  });

  await t.test('3. installed seam normalizes ["A1", "B2"] to ["a1", "b2"]', () => {
    const h = setupPrepareHarness();
    try {
      h.installSeatNormalizationSeam();
      assert.deepEqual(h.passengerSeatHold.normalizeSeatNumbers(['A1', 'B2']), ['a1', 'b2']);
    } finally {
      h.restore();
    }
  });

  await t.test('4. restore removes the fabricated normalizeSeatNumbers method', () => {
    const h = setupPrepareHarness();
    h.installSeatNormalizationSeam();
    assert.equal(typeof h.passengerSeatHold.normalizeSeatNumbers, 'function');
    h.restore();
    assert.equal(typeof h.passengerSeatHold.normalizeSeatNumbers, 'undefined');
  });

  await t.test('5. Recreating harness starts again with the real absent export', () => {
    const h1 = setupPrepareHarness();
    h1.installSeatNormalizationSeam();
    h1.restore();

    const h2 = setupPrepareHarness();
    try {
      assert.equal(typeof h2.passengerSeatHold.normalizeSeatNumbers, 'undefined');
    } finally {
      h2.restore();
    }
  });
});
