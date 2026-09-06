'use strict';

const axios = require('axios');
const logger = require('../utils/logger.js');
const { toMinorUnits } = require('../src/shared/money');

function readVerificationConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const productCode = env.ESEWA_PRODUCT_CODE || (production ? '' : 'EPAYTEST');
  if (!productCode) {
    throw new Error('ESEWA_PRODUCT_CODE is required for eSewa verification');
  }
  const config = {
    productCode,
    baseUrl: env.ESEWA_STATUS_URL || (
      production
        ? 'https://esewa.com.np/api/epay/transaction/status/'
        : 'https://rc.esewa.com.np/api/epay/transaction/status/'
    ),
  };
  const target = new URL(config.baseUrl);
  const hosts = production ? ['esewa.com.np', 'epay.esewa.com.np']
    : ['rc.esewa.com.np', 'rc-epay.esewa.com.np'];
  if (target.protocol !== 'https:' || !hosts.includes(target.hostname) || target.username || target.password
    || (production && productCode === 'EPAYTEST')) throw new Error('Untrusted eSewa verification environment');
  return config;
}

function parseAmount(data) {
  const raw = data?.total_amount ?? data?.totalAmount;
  return Number(String(raw ?? '').replace(/,/g, ''));
}

async function verifyEsewaPayment(transactionUuid, totalAmount, { allowedStatuses = ['COMPLETE'] } = {}) {
  let config;
  try {
    config = readVerificationConfig();
    toMinorUnits(totalAmount, { allowZero: false });
  } catch (error) {
    logger.error('esewaVerification: configuration invalid', {
      error: error.message,
    });
    return { verified: false, error: error.message };
  }

  try {
    const response = await axios.get(config.baseUrl, {
      params: {
        product_code: config.productCode,
        total_amount: totalAmount,
        transaction_uuid: transactionUuid,
      },
      timeout: 10_000,
      maxRedirects: 0,
      headers: { Accept: 'application/json' },
    });
    const data = response.data;
    const status = data?.status;
    const reportedUuid = data?.transaction_uuid ?? data?.pid;
    const reportedProduct = data?.product_code ?? data?.scd;
    const reportedAmount = parseAmount(data);

    if (
      !reportedUuid || String(reportedUuid) !== String(transactionUuid) ||
      !reportedProduct || String(reportedProduct) !== config.productCode ||
      !Number.isFinite(reportedAmount) ||
      toMinorUnits(reportedAmount) !== toMinorUnits(totalAmount)
    ) {
      logger.warn('esewaVerification: payment identity mismatch', {
        transactionUuid,
        expectedAmount: totalAmount,
        reportedUuid,
        reportedProduct,
        reportedAmount,
      });
      return {
        verified: false,
        identityVerified: false,
        status,
        error: 'eSewa payment identity or amount did not match.',
        esewaData: data,
      };
    }
    if (!allowedStatuses.includes(status)) return {
      verified: false, identityVerified: true, status,
      error: `eSewa payment status is "${status}" — expected "${allowedStatuses.join(' or ')}"`, esewaData: data,
    };
    logger.info('esewaVerification: payment verified', {
      transactionUuid,
      totalAmount,
      refId: data?.ref_id ?? data?.refId,
    });
    return { verified: true, identityVerified: true, status, esewaData: data };
  } catch (error) {
    logger.error('esewaVerification: status request failed closed', {
      transactionUuid,
      error: error.message,
      status: error.response?.status,
    });
    return {
      verified: false,
      error:
        error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
          ? 'eSewa verification service timed out. Please try again.'
          : 'eSewa verification failed due to an unexpected error.',
    };
  }
}

module.exports = {
  verifyEsewaPayment,
  readVerificationConfig,
  parseAmount,
};
