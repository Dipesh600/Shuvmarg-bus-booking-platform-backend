'use strict';
/**
 * tests/characterization/payment-booking-prepare-harness-contract.test.js
 * Contract tests for prepareBooking harness and real production seat normalization facade.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const passengerSeatHold = require('../../src/modules/booking/passenger-seat-hold');
const { setupPrepareHarness } = require('../helpers/payment-booking-prepare-harness.js');

test('prepareBooking harness contract characterization', async (t) => {
  await t.test('1. Base harness exposes normalizeSeatNumbers as a function', () => {
    const h = setupPrepareHarness();
    try {
      assert.equal(typeof h.passengerSeatHold.normalizeSeatNumbers, 'function');
    } finally {
      h.restore();
    }
  });

  await t.test('2. Facade normalizer is the exact same function as policy.normalizeSeatNumbers', () => {
    const h = setupPrepareHarness();
    try {
      assert.equal(h.passengerSeatHold.normalizeSeatNumbers, passengerSeatHold.policy.normalizeSeatNumbers);
    } finally {
      h.restore();
    }
  });

  await t.test('3. Normalizing ["A1", "B2"] produces ["a1", "b2"]', () => {
    const h = setupPrepareHarness();
    try {
      assert.deepEqual(h.passengerSeatHold.normalizeSeatNumbers(['A1', 'B2']), ['a1', 'b2']);
    } finally {
      h.restore();
    }
  });

  await t.test('4. restore does not remove the real production export', () => {
    const h = setupPrepareHarness();
    assert.equal(typeof h.passengerSeatHold.normalizeSeatNumbers, 'function');
    h.restore();
    assert.equal(typeof passengerSeatHold.normalizeSeatNumbers, 'function');
    assert.equal(passengerSeatHold.normalizeSeatNumbers, passengerSeatHold.policy.normalizeSeatNumbers);
  });

  await t.test('5. Recreating the harness still exposes the production function', () => {
    const h1 = setupPrepareHarness();
    h1.restore();

    const h2 = setupPrepareHarness();
    try {
      assert.equal(typeof h2.passengerSeatHold.normalizeSeatNumbers, 'function');
      assert.equal(h2.passengerSeatHold.normalizeSeatNumbers, passengerSeatHold.policy.normalizeSeatNumbers);
    } finally {
      h2.restore();
    }
  });

  await t.test('6. The harness does not install an own synthetic replacement', () => {
    const productionNormalizer = passengerSeatHold.policy.normalizeSeatNumbers;
    const h = setupPrepareHarness();
    try {
      assert.equal(h.passengerSeatHold.normalizeSeatNumbers, productionNormalizer);
    } finally {
      h.restore();
    }
  });
});
