'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectPaymentIndexes } = require('../../scripts/preflightPaymentIndexes');
test('index preflight checks uniqueness and scope without writing', async () => {
  const model = { collection: { name: 'bookings' }, schema: { indexes: () => [[{ operationKey: 1 }, { unique: true, partialFilterExpression: { operationKey: { $type: 'string' } } }]] } };
  let actual = [{ key: { operationKey: 1 }, unique: false }];
  const db = { collection: () => ({ listIndexes: () => ({ toArray: async () => actual }) }) };
  assert.equal((await inspectPaymentIndexes(db, [model])).ready, false);
  actual = [{ key: { operationKey: 1 }, unique: true, partialFilterExpression: { operationKey: { $type: 'string' } } }];
  assert.equal((await inspectPaymentIndexes(db, [model])).ready, true);
  actual[0].partialFilterExpression = { operationKey: { $type: 'number' } };
  assert.equal((await inspectPaymentIndexes(db, [model])).ready, false);
});
