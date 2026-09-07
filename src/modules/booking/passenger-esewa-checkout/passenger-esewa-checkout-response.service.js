'use strict';
const { parseEsewaAmount } = require('../../../shared/esewa-amount');
const { toMinorUnits } = require('../../../shared/money');

function decodeEsewaResponse(responseData) {
  if (!responseData) return null;
  if (
    typeof responseData !== 'string' ||
    responseData.length > 12_000 ||
    !/^[A-Za-z0-9+/=_-]+$/.test(responseData)
  ) {
    throw invalidResponse();
  }
  try {
    const normalized = responseData.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(
      Buffer.from(normalized, 'base64').toString('utf8')
    );
    if (!payload || typeof payload !== 'object') throw invalidResponse();
    return payload;
  } catch {
    throw invalidResponse();
  }
}

function validateEsewaResponse({
  responseData,
  attempt,
  secretKey,
  signature,
}) {
  const payload = decodeEsewaResponse(responseData);
  if (!payload) return null;
  let amount;
  try { amount = parseEsewaAmount(payload.total_amount); } catch { throw invalidResponse(); }
  if (
    !signature.verifyEsewaResponse(payload, secretKey) ||
    payload.transaction_uuid !== attempt.transactionUuid ||
    payload.product_code !== attempt.productCode ||
    toMinorUnits(amount) !== toMinorUnits(attempt.gatewayAmount)
  ) {
    throw invalidResponse();
  }
  return payload;
}

function invalidResponse() {
  const error = new Error('The eSewa response could not be authenticated.');
  error.code = 'ESEWA_CHECKOUT_INVALID';
  error.statusCode = 400;
  return error;
}

module.exports = { decodeEsewaResponse, validateEsewaResponse };
