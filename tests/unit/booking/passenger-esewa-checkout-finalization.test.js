'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { attempt, makeService } = require('../../helpers/passenger-esewa-finalization-fixture');

test('finalization uses the owned attempt snapshot and completes once', async () => {
  const h = makeService();
  const result = await h.service({
    userId: 'user-1',
    activeRole: 'passenger',
    transactionUuid: 'SM-1',
  });
  assert.equal(result.statusCode, 201);
  assert.equal(h.getRequest().body.paymentAmount, 900);
  assert.equal(h.getRequest().body.paymentId, 'SM-1');
  assert.equal(h.getRequest().paymentAttemptQuote, h.current.confirmationQuote);
  assert.equal(h.getRequest().providerPaymentVerified, true);
  assert.equal(h.updates.at(-1).status, 'COMPLETED');
  assert.equal(h.updates.at(-1).bookingId, 'booking-1');
});

test('an unconfirmed provider result cannot reach booking orchestration', async () => {
  let orchestrated = false;
  const pending = { statusCode: 202, body: { success: false } };
  const h = makeService({ deps: {
    verifyPayment: async () => ({ verified: false }),
    orchestrate: async () => { orchestrated = true; },
    recovery: { recoverRecordedTransaction: async () => null, handleUnverified: async () => pending },
  } });
  assert.equal(await h.service({ userId: 'user-1', transactionUuid: 'SM-1' }), pending);
  assert.equal(orchestrated, false);
});

test('completed attempts are idempotent and do not run confirmation again', async () => {
  const stored = {
    statusCode: 201,
    body: { success: true, data: { bookingId: 'booking-1' } },
  };
  let claimed = false;
  const h = makeService({
    repository: {
      findOwnedAttempt: async () => attempt({
        status: 'COMPLETED',
        result: stored,
      }),
      claimOwnedAttempt: async () => {
        claimed = true;
      },
    },
  });
  assert.equal(
    await h.service({ userId: 'user-1', transactionUuid: 'SM-1' }),
    stored
  );
  assert.equal(claimed, false);
});

test('foreign and concurrently claimed attempts are rejected', async () => {
  const missing = makeService({
    repository: { findOwnedAttempt: async () => null },
  });
  const notFound = await missing.service({
    userId: 'other',
    transactionUuid: 'SM-1',
  });
  assert.equal(notFound.body.errorCode, 'ESEWA_PAYMENT_ATTEMPT_NOT_FOUND');

  const busy = makeService({
    repository: { claimOwnedAttempt: async () => null },
  });
  const conflict = await busy.service({
    userId: 'user-1',
    transactionUuid: 'SM-1',
  });
  assert.equal(conflict.body.errorCode, 'ESEWA_PAYMENT_CONFIRMATION_IN_PROGRESS');
});
