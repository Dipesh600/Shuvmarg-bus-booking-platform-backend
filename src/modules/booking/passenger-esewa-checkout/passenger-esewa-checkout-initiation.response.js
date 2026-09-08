'use strict';
const { assertEsewaAttemptEnvironment } = require('../../../shared/esewa-environment');

function initiationResponse(attempt, config) {
  assertEsewaAttemptEnvironment(attempt, config);
  return {
    statusCode: 201,
    body: {
      success: true,
      data: {
        transactionUuid: attempt.transactionUuid,
        paymentUrl: config.paymentUrl,
        fields: attempt.formFields,
        expiresAt: attempt.holdExpiresAt,
      },
    },
  };
}

module.exports = { initiationResponse };
