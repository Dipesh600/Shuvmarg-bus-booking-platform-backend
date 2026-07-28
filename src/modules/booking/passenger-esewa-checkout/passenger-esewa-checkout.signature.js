'use strict';

const crypto = require('crypto');

const REQUEST_SIGNED_FIELDS =
  'total_amount,transaction_uuid,product_code';
const RESPONSE_SIGNED_FIELDS = [
  'transaction_code',
  'status',
  'total_amount',
  'transaction_uuid',
  'product_code',
  'signed_field_names',
];

function createSignature(message, secretKey) {
  return crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('base64');
}

function signEsewaRequest({
  totalAmount,
  transactionUuid,
  productCode,
  secretKey,
}) {
  const message = [
    `total_amount=${totalAmount}`,
    `transaction_uuid=${transactionUuid}`,
    `product_code=${productCode}`,
  ].join(',');
  return createSignature(message, secretKey);
}

function verifyEsewaResponse(payload, secretKey) {
  if (!payload || !payload.signature || !payload.signed_field_names) {
    return false;
  }
  const fields = String(payload.signed_field_names).split(',');
  if (
    RESPONSE_SIGNED_FIELDS.some((field) => !fields.includes(field)) ||
    fields.some((field) => !field || payload[field] === undefined)
  ) {
    return false;
  }
  const message = fields
    .map((field) => `${field}=${payload[field]}`)
    .join(',');
  const expected = createSignature(message, secretKey);
  const actualBuffer = Buffer.from(String(payload.signature));
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

module.exports = {
  REQUEST_SIGNED_FIELDS,
  RESPONSE_SIGNED_FIELDS,
  signEsewaRequest,
  verifyEsewaResponse,
};
