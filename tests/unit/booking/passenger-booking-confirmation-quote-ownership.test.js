'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('confirmation quote single-owner static architecture contract', async (t) => {
  const controllerPath = path.resolve(__dirname, '../../../controllers/ticketController/paymentBookingController.js');
  const policyPath = path.resolve(__dirname, '../../../src/modules/booking/passenger-booking-confirmation-quote/passenger-booking-confirmation-quote.policy.js');

  const controllerSource = fs.readFileSync(controllerPath, 'utf8');
  const policySource = fs.readFileSync(policyPath, 'utf8');

  await t.test('controller does not contain duplicated validation rules or strings', () => {
    assert.equal(controllerSource.includes('SUPPORTED_BOOKING_GATEWAYS'), false);
    assert.equal(controllerSource.includes('The selected payment gateway is not supported.'), false);
    assert.equal(controllerSource.includes('Missing required fields for booking confirmation'), false);
  });

  await t.test('confirmation quote policy owns validation functions and exact response constants', () => {
    assert.equal(policySource.includes('validateConfirmationGateway'), true);
    assert.equal(policySource.includes('validateConfirmationReference'), true);
    assert.equal(policySource.includes('UNSUPPORTED_PAYMENT_GATEWAY'), true);
    assert.equal(policySource.includes('Missing required fields for booking confirmation'), true);
  });
});
