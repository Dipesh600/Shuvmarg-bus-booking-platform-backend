'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ensureIndexes = require(
  '../../../scripts/ensureEsewaPaymentAttemptIndexes.js'
);

test('eSewa attempt index migration installs idempotent constraints', async () => {
  const calls = [];
  const mongoose = {
    connection: {
      collection: (name) => {
        assert.equal(name, 'esewapaymentattempts');
        return {
          createIndex: async (...args) => calls.push(args),
        };
      },
    },
  };

  assert.deepEqual(await ensureIndexes(mongoose), { success: true });
  assert.deepEqual(calls, [
    [{ tempBookingId: 1 }, { unique: true }],
    [{ transactionUuid: 1 }, { unique: true }],
    [{ userId: 1, createdAt: -1 }],
    [{ status: 1, processingExpiresAt: 1 }],
  ]);
});
