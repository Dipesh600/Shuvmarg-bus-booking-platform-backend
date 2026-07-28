'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const {
  verifyEsewaPayment,
} = require('../../../services/esewaVerificationService');

test('eSewa verification never accepts missing configuration in production', async (t) => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    productCode: process.env.ESEWA_PRODUCT_CODE,
  };
  t.after(() => {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.productCode === undefined) {
      delete process.env.ESEWA_PRODUCT_CODE;
    } else {
      process.env.ESEWA_PRODUCT_CODE = previous.productCode;
    }
  });
  process.env.NODE_ENV = 'production';
  delete process.env.ESEWA_PRODUCT_CODE;

  const result = await verifyEsewaPayment('SM-1', 100);
  assert.equal(result.verified, false);
  assert.match(result.error, /ESEWA_PRODUCT_CODE/);
});

test('timeout and provider identity mismatch both fail closed', async (t) => {
  const originalGet = axios.get;
  const previousCode = process.env.ESEWA_PRODUCT_CODE;
  process.env.ESEWA_PRODUCT_CODE = 'EPAYTEST';
  t.after(() => {
    axios.get = originalGet;
    if (previousCode === undefined) delete process.env.ESEWA_PRODUCT_CODE;
    else process.env.ESEWA_PRODUCT_CODE = previousCode;
  });

  axios.get = async () => {
    const error = new Error('timeout');
    error.code = 'ETIMEDOUT';
    throw error;
  };
  const timeout = await verifyEsewaPayment('SM-1', 100);
  assert.equal(timeout.verified, false);

  axios.get = async () => ({
    data: {
      status: 'COMPLETE',
      transaction_uuid: 'SM-OTHER',
      product_code: 'EPAYTEST',
      total_amount: 100,
    },
  });
  const mismatch = await verifyEsewaPayment('SM-1', 100);
  assert.equal(mismatch.verified, false);
});

test('matching COMPLETE status is verified', async (t) => {
  const originalGet = axios.get;
  process.env.ESEWA_PRODUCT_CODE = 'EPAYTEST';
  t.after(() => {
    axios.get = originalGet;
  });
  axios.get = async () => ({
    data: {
      status: 'COMPLETE',
      transaction_uuid: 'SM-1',
      product_code: 'EPAYTEST',
      total_amount: '100.00',
      ref_id: 'REF-1',
    },
  });
  const result = await verifyEsewaPayment('SM-1', 100);
  assert.equal(result.verified, true);
  assert.equal(result.esewaData.ref_id, 'REF-1');
});
