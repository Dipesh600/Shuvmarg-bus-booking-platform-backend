'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  readEsewaCheckoutConfig,
} = require(
  '../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.config'
);

test('production checkout requires credentials and HTTPS passenger URL', () => {
  assert.throws(
    () => readEsewaCheckoutConfig({ NODE_ENV: 'production' }),
    { code: 'ESEWA_CONFIGURATION_INVALID' }
  );
  assert.throws(
    () => readEsewaCheckoutConfig({
      NODE_ENV: 'production',
      ESEWA_PRODUCT_CODE: 'MERCHANT',
      ESEWA_SECRET_KEY: 'secret',
      PASSENGER_APP_URL: 'http://passenger.example',
    }),
    { code: 'ESEWA_CONFIGURATION_INVALID' }
  );
});

test('checkout rejects non-eSewa payment destinations', () => {
  assert.throws(
    () => readEsewaCheckoutConfig({
      ESEWA_PRODUCT_CODE: 'EPAYTEST',
      ESEWA_SECRET_KEY: 'secret',
      PASSENGER_APP_URL: 'http://localhost:3000',
      ESEWA_PAYMENT_URL: 'https://attacker.example/collect',
    }),
    { code: 'ESEWA_CONFIGURATION_INVALID' }
  );
});

test('trusted UAT configuration is returned without exposing defaults', () => {
  const config = readEsewaCheckoutConfig({
    ESEWA_PRODUCT_CODE: 'EPAYTEST',
    ESEWA_SECRET_KEY: 'secret',
    PASSENGER_APP_URL: 'http://localhost:3000/',
  });
  assert.equal(config.passengerUrl, 'http://localhost:3000');
  assert.equal(
    config.paymentUrl,
    'https://rc-epay.esewa.com.np/api/epay/main/v2/form'
  );
});
