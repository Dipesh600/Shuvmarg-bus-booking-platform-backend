'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mapper = require(
  '../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.mapper'
);
const {
  createPassengerEsewaCheckoutFinalizationService,
} = require('../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout-finalization.service');

test('invalid provider response releases the verification claim', async () => {
  const paymentAttempt = {
    _id: 'attempt-1',
    userId: 'user-1',
    transactionUuid: 'SM-1',
    status: 'INITIATED',
  };
  const updates = [];
  const validationError = new Error('Invalid eSewa response signature.');
  const service = createPassengerEsewaCheckoutFinalizationService({
    readConfig: () => ({ secretKey: 'secret' }),
    repository: {
      findOwnedAttempt: async () => paymentAttempt,
      claimOwnedAttempt: async () => paymentAttempt,
      updateAttempt: async (_id, update) => updates.push(update),
    },
    mapper,
    signature: {},
    validateResponse: () => {
      throw validationError;
    },
    recovery: {
      recoverRecordedTransaction: async () => null,
    },
  });

  await assert.rejects(
    service({ userId: 'user-1', transactionUuid: 'SM-1' }),
    validationError
  );
  assert.deepEqual(updates, [{
    status: 'INITIATED',
    processingExpiresAt: null,
  }]);
});
