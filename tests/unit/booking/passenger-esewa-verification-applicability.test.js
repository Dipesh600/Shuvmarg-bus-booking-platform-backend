'use strict';

/**
 * tests/unit/booking/passenger-esewa-verification-applicability.test.js
 * Unit tests for passenger eSewa verification applicability logic.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const mapper = require('../../../src/modules/booking/passenger-esewa-verification/passenger-esewa-verification.mapper.js');
const { createPassengerEsewaVerificationService } = require('../../../src/modules/booking/passenger-esewa-verification/passenger-esewa-verification.service.js');

test('passengerEsewaVerificationApplicability unit tests', async (t) => {
  await t.test('1, 2, 7. wallet gateway returns non-applicable success without verification call', async () => {
    let called = false;
    const service = createPassengerEsewaVerificationService({
      verifyEsewaPayment: async () => { called = true; return { verified: true }; },
      mapper,
    });

    const res = await service.verifyPassengerEsewaPayment({
      gateway: 'wallet',
      paymentId: 'pay_1',
      gatewayAmount: 100,
      userId: 'u1',
    });

    assert.equal(called, false);
    assert.deepEqual(res, { ok: true, applied: false, verified: false });
    assert.equal(res.statusCode, undefined);
    assert.equal(res.body, undefined);
  });

  await t.test('3. valid eSewa gateway attempts verification', async () => {
    let called = false;
    const service = createPassengerEsewaVerificationService({
      verifyEsewaPayment: async () => { called = true; return { verified: true }; },
      mapper,
    });

    const res = await service.verifyPassengerEsewaPayment({
      gateway: 'esewa',
      paymentId: 'pay_1',
      gatewayAmount: 100,
      userId: 'u1',
    });

    assert.equal(called, true);
    assert.deepEqual(res, { ok: true, applied: true, verified: true });
  });

  await t.test('4. missing paymentId performs zero verification calls and returns 400', async () => {
    let called = false;
    const service = createPassengerEsewaVerificationService({
      verifyEsewaPayment: async () => { called = true; return { verified: true }; },
      mapper,
    });

    const res = await service.verifyPassengerEsewaPayment({
      gateway: 'esewa',
      paymentId: null,
      gatewayAmount: 100,
      userId: 'u1',
    });

    assert.equal(called, false);
    assert.equal(res.ok, false);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.errorCode, 'ESEWA_PARAMS_MISSING');
  });

  await t.test('5 & 6. missing or zero gatewayAmount performs zero verification calls and returns 400', async () => {
    let called = false;
    const service = createPassengerEsewaVerificationService({
      verifyEsewaPayment: async () => { called = true; return { verified: true }; },
      mapper,
    });

    const resZero = await service.verifyPassengerEsewaPayment({
      gateway: 'esewa',
      paymentId: 'pay_1',
      gatewayAmount: 0,
      userId: 'u1',
    });

    assert.equal(called, false);
    assert.equal(resZero.ok, false);
    assert.equal(resZero.statusCode, 400);
    assert.equal(resZero.body.errorCode, 'ESEWA_PARAMS_MISSING');
  });
});
