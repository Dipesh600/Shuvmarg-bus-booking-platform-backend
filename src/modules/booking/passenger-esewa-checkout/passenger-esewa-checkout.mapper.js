'use strict';

function mapError(error) {
  if (error?.statusCode) return response(error.statusCode, error.message, error.code || 'PAYMENT_REQUEST_REJECTED');
  if (error?.code === 'ESEWA_CONFIGURATION_INVALID') {
    return response(
      503,
      'Online payment is temporarily unavailable.',
      'ESEWA_CONFIGURATION_INVALID'
    );
  }
  if (error?.code === 'ESEWA_CHECKOUT_INVALID') {
    return response(
      error.statusCode || 400,
      error.message,
      'ESEWA_CHECKOUT_INVALID'
    );
  }
  return response(
    500,
    'Online payment could not be started. Please try again.',
    'ESEWA_CHECKOUT_FAILED'
  );
}

function response(statusCode, message, errorCode, extra = {}) {
  return {
    statusCode,
    body: {
      success: false,
      message,
      errorCode,
      ...extra,
    },
  };
}

module.exports = { mapError, response };
