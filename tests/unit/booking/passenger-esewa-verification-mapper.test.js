'use strict';

/**
 * tests/unit/booking/passenger-esewa-verification-mapper.test.js
 * Unit tests for passenger eSewa verification mapper.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  mapEsewaParametersMissing,
  mapEsewaVerificationFailure,
} = require('../../../src/modules/booking/passenger-esewa-verification/passenger-esewa-verification.mapper.js');

test('passengerEsewaVerificationMapper unit tests', async (t) => {
  await t.test('1-5 & 11. mapEsewaParametersMissing returns exact missing-parameters shape', () => {
    const res = mapEsewaParametersMissing();
    assert.deepEqual(res, {
      ok: false,
      applied: true,
      verified: false,
      statusCode: 400,
      body: {
        success: false,
        message: 'Missing paymentId or paymentAmount for eSewa confirmation',
        errorCode: 'ESEWA_PARAMS_MISSING',
      },
      compensationReason: 'Missing paymentId or gatewayAmount for eSewa',
    });
  });

  await t.test('6-10 & 11. mapEsewaVerificationFailure returns exact verification-failure shape', () => {
    const errorMsg = 'Invalid signature';
    const res = mapEsewaVerificationFailure(errorMsg);
    assert.deepEqual(res, {
      ok: false,
      applied: true,
      verified: false,
      statusCode: 402,
      body: {
        success: false,
        message: 'Payment verification failed: Invalid signature',
        errorCode: 'ESEWA_VERIFICATION_FAILED',
      },
      compensationReason: 'eSewa verification failed: Invalid signature',
    });
  });
});
