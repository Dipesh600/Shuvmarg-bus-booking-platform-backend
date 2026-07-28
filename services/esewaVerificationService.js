'use strict';

const axios = require('axios');
const logger = require('../utils/logger.js');

function readVerificationConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const productCode = env.ESEWA_PRODUCT_CODE || (production ? '' : 'EPAYTEST');
  if (!productCode) {
    throw new Error('ESEWA_PRODUCT_CODE is required for eSewa verification');
  }
  return {
    productCode,
    baseUrl: env.ESEWA_STATUS_URL || (
      production
        ? 'https://epay.esewa.com.np/api/epay/transaction/status/'
        : 'https://uat.esewa.com.np/api/epay/transaction/status/'
    ),
  };
}

function parseAmount(data) {
  const raw = data?.total_amount ?? data?.totalAmount;
  return Number(String(raw ?? '').replace(/,/g, ''));
}

async function verifyEsewaPayment(transactionUuid, totalAmount) {
  let config;
  try {
    config = readVerificationConfig();
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
      headers: { Accept: 'application/json' },
    });
    const data = response.data;
    const status = data?.status;
    const reportedUuid = data?.transaction_uuid ?? data?.pid;
    const reportedProduct = data?.product_code ?? data?.scd;
    const reportedAmount = parseAmount(data);

    if (status !== 'COMPLETE') {
      return {
        verified: false,
        status,
        error: `eSewa payment status is "${status}" — expected "COMPLETE"`,
        esewaData: data,
      };
    }
    if (
      (reportedUuid && String(reportedUuid) !== String(transactionUuid)) ||
      (reportedProduct && String(reportedProduct) !== config.productCode) ||
      !Number.isFinite(reportedAmount) ||
      Math.abs(reportedAmount - Number(totalAmount)) > 0.01
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
        status,
        error: 'eSewa payment identity or amount did not match.',
        esewaData: data,
      };
    }
    logger.info('esewaVerification: payment verified', {
      transactionUuid,
      totalAmount,
      refId: data?.ref_id ?? data?.refId,
    });
    return { verified: true, status, esewaData: data };
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
