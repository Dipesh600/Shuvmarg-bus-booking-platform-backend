'use strict';
const { readEsewaEnvironment, isTrustedEsewaUrl } = require('../../../shared/esewa-environment');

function readEsewaCheckoutConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const environment = readEsewaEnvironment(env);
  const productCode = env.ESEWA_PRODUCT_CODE || (environment.sandbox ? 'EPAYTEST' : '');
  const secretKey = env.ESEWA_SECRET_KEY || '';
  const passengerUrl = (env.PASSENGER_APP_URL || '').replace(/\/+$/, '');
  const paymentUrl = env.ESEWA_PAYMENT_URL || (
    !environment.sandbox
      ? 'https://epay.esewa.com.np/api/epay/main/v2/form'
      : 'https://rc-epay.esewa.com.np/api/epay/main/v2/form'
  );

  if (!productCode || !secretKey || !passengerUrl) {
    const error = new Error(
      'eSewa checkout requires ESEWA_PRODUCT_CODE, ESEWA_SECRET_KEY, and PASSENGER_APP_URL'
    );
    error.code = 'ESEWA_CONFIGURATION_INVALID';
    throw error;
  }
  let paymentTarget;
  let passengerTarget;
  try {
    paymentTarget = new URL(paymentUrl);
    passengerTarget = new URL(passengerUrl);
  } catch {
    throw configurationError('eSewa checkout URLs are invalid');
  }
  if (
    !isTrustedEsewaUrl(paymentTarget.href, [environment.paymentHost]) ||
    (!environment.sandbox && productCode === 'EPAYTEST') ||
    !['http:', 'https:'].includes(passengerTarget.protocol) || passengerTarget.username || passengerTarget.password ||
    (production && passengerTarget.protocol !== 'https:')
  ) {
    throw configurationError('eSewa checkout URLs are not trusted');
  }

  return {
    paymentEnvironment: environment.sandbox ? 'sandbox' : 'live',
    productCode,
    secretKey,
    passengerUrl,
    paymentUrl,
  };
}

function configurationError(message) {
  const error = new Error(message);
  error.code = 'ESEWA_CONFIGURATION_INVALID';
  return error;
}

module.exports = { readEsewaCheckoutConfig };
