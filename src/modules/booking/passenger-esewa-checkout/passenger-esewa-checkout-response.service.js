'use strict';

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
  const amount = Number(String(payload.total_amount || '').replace(/,/g, ''));
  if (
    !signature.verifyEsewaResponse(payload, secretKey) ||
    payload.transaction_uuid !== attempt.transactionUuid ||
    payload.product_code !== attempt.productCode ||
    Math.abs(amount - attempt.gatewayAmount) > 0.01
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
