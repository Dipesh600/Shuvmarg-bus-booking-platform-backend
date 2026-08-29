'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('../../../routes/agentRoute/agentRoute');
const auth = require('../../../middleware/authMiddleware');
const verifyRoleFromDB = require('../../../middleware/verifyRoleFromDB');
const { agentMiddleware } = require('../../../middleware/checkRole');
const limiter = require('../../../middleware/agentSaleWriteRateLimit');
const hold = require('../../../src/modules/agent/seat-hold');
const sale = require('../../../src/modules/agent/cash-sale');

const handlersFor = (routePath) => router.stack
  .find((layer) => layer.route?.path === routePath)
  .route.stack.map((layer) => layer.handle);

test('V2/V11 hold has the exact explicit-gate agent chain and write limiter', () => {
  assert.deepEqual(handlersFor('/seat-holds'), [
    auth, verifyRoleFromDB, agentMiddleware, limiter, hold.createHold,
  ]);
});

test('V3/V11 sale has the same agent chain and write limiter', () => {
  assert.deepEqual(handlersFor('/sales'), [
    auth, verifyRoleFromDB, agentMiddleware, limiter, sale.commitSale,
  ]);
});
