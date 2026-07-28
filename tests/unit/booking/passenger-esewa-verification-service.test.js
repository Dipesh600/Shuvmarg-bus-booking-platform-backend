'use strict';

/**
 * tests/unit/booking/passenger-esewa-verification-service.test.js
 * Unit tests for passenger eSewa verification service.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const mapper = require('../../../src/modules/booking/passenger-esewa-verification/passenger-esewa-verification.mapper.js');
const { createPassengerEsewaVerificationService } = require('../../../src/modules/booking/passenger-esewa-verification/passenger-esewa-verification.service.js');

test('passengerEsewaVerificationService unit tests', async (t) => {
  await t.test('1-6. passes exact arguments and logs info on verification success', async () => {
    let capturedArgs = null;
    let loggedInfo = null;
    const logger = {
      info: (msg, meta) => { loggedInfo = { msg, meta }; },
      warn: () => {},
    };

    const service = createPassengerEsewaVerificationService({
      verifyEsewaPayment: async (pid, amt) => {
        capturedArgs = { pid, amt };
        return { verified: true };
      },
      logger,
      mapper,
    });

    const res = await service.verifyPassengerEsewaPayment({
      gateway: 'esewa',
      paymentId: 'esewa_txn_999',
      gatewayAmount: 1500,
      userId: 'user_777',
    });

    assert.deepEqual(capturedArgs, { pid: 'esewa_txn_999', amt: 1500 });
    assert.deepEqual(res, { ok: true, applied: true, verified: true });
    assert.equal(loggedInfo.msg, 'confirmBooking: eSewa payment verified');
    assert.deepEqual(loggedInfo.meta, {
      paymentId: 'esewa_txn_999',
      userId: 'user_777',
      gatewayAmount: 1500,
    });
  });

  await t.test('7-10. logs warning and returns status 402 with error on verification failure', async () => {
    let loggedWarn = null;
    const logger = {
      info: () => {},
      warn: (msg, meta) => { loggedWarn = { msg, meta }; },
    };

    const service = createPassengerEsewaVerificationService({
      verifyEsewaPayment: async () => ({ verified: false, error: 'Transaction expired' }),
      logger,
      mapper,
    });

    const res = await service.verifyPassengerEsewaPayment({
      gateway: 'esewa',
      paymentId: 'esewa_txn_888',
      gatewayAmount: 500,
      userId: 'user_333',
    });

    assert.equal(res.ok, false);
    assert.equal(res.statusCode, 402);
    assert.equal(res.body.errorCode, 'ESEWA_VERIFICATION_FAILED');
    assert.equal(res.body.message, 'Payment verification failed: Transaction expired');
    assert.equal(res.compensationReason, 'eSewa verification failed: Transaction expired');
    assert.equal(loggedWarn.msg, 'confirmBooking: eSewa verification failed');
    assert.deepEqual(loggedWarn.meta, {
      paymentId: 'esewa_txn_888',
      gatewayAmount: 500,
      userId: 'user_333',
      reason: 'Transaction expired',
    });
  });

  await t.test('11 & 12. thrown verification exception propagates directly without mapping', async () => {
    const service = createPassengerEsewaVerificationService({
      verifyEsewaPayment: async () => { throw new Error('eSewa API timeout'); },
      logger: { info: () => {}, warn: () => {} },
      mapper,
    });

    await assert.rejects(
      async () => service.verifyPassengerEsewaPayment({
        gateway: 'esewa',
        paymentId: 'esewa_txn_111',
        gatewayAmount: 1000,
        userId: 'user_111',
      }),
      { message: 'eSewa API timeout' }
    );
  });
});
