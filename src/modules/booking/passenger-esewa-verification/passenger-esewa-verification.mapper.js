'use strict';

/**
 * src/modules/booking/passenger-esewa-verification/passenger-esewa-verification.mapper.js
 * Mappers for passenger eSewa payment verification structured results.
 */

function mapEsewaParametersMissing() {
  return {
    ok: false,
    applied: true,
    verified: false,
    statusCode: 400,
    body: {
      success: false,
      message: 'Missing paymentId or paymentAmount for eSewa confirmation',
      errorCode: 'ESEWA_PARAMS_MISSING',
    },
    compensationReason: 'Missing paymentId or gatewayAmount for eSewa',
  };
}

function mapEsewaVerificationFailure(error) {
  return {
    ok: false,
    applied: true,
    verified: false,
    statusCode: 402,
    body: {
      success: false,
      message: `Payment verification failed: ${error}`,
      errorCode: 'ESEWA_VERIFICATION_FAILED',
    },
    compensationReason: `eSewa verification failed: ${error}`,
  };
}

module.exports = {
  mapEsewaParametersMissing,
  mapEsewaVerificationFailure,
};
