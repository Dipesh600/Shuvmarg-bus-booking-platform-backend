'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const signature = require(
  '../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.signature'
);

test('eSewa request signature uses HMAC-SHA256 over ordered fields', () => {
  const actual = signature.signEsewaRequest({
    totalAmount: '100',
    transactionUuid: '11-201-13',
    productCode: 'EPAYTEST',
    secretKey: '8gBm/:&EnhH.1/q',
  });
  assert.equal(
    actual,
    '5DZywcrTKD0gia/rsSMcrRHmJl+4Tbol6S+lWgdJ94E='
  );
});

test('signed eSewa response is accepted and tampering is rejected', () => {
  const secretKey = 'test-secret';
  const payload = {
    transaction_code: 'REF-1',
    status: 'COMPLETE',
    total_amount: 100,
    transaction_uuid: 'SM-1',
    product_code: 'EPAYTEST',
    signed_field_names:
      'transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names',
  };
  const message = payload.signed_field_names
    .split(',')
    .map((field) => `${field}=${payload[field]}`)
    .join(',');
  const crypto = require('crypto');
  payload.signature = crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('base64');

  assert.equal(
    signature.verifyEsewaResponse(payload, secretKey),
    true
  );
  assert.equal(
    signature.verifyEsewaResponse(
      { ...payload, total_amount: 101 },
      secretKey
    ),
    false
  );

  const incomplete = {
    ...payload,
    signed_field_names: 'transaction_code,status,signed_field_names',
  };
  const incompleteMessage = incomplete.signed_field_names
    .split(',')
    .map((field) => `${field}=${incomplete[field]}`)
    .join(',');
  incomplete.signature = crypto
    .createHmac('sha256', secretKey)
    .update(incompleteMessage)
    .digest('base64');
  assert.equal(
    signature.verifyEsewaResponse(incomplete, secretKey),
    false,
    'identity and amount fields must all be covered by the signature'
  );
});
