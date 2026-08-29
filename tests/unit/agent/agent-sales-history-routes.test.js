'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const auth = require('../../../middleware/authMiddleware');
const verifyRoleFromDB = require('../../../middleware/verifyRoleFromDB');
const { agentMiddleware } = require('../../../middleware/checkRole');
const limiter = require('../../../middleware/agentSalesReadRateLimit');
const history = require('../../../src/modules/agent/sales-history');
const register = require('../../../routes/agentRoute/agentSalesReadRoutes');

const handlers = (router, path) => router.stack
  .find((layer) => layer.route?.path === path && layer.route.methods.get)
  .route.stack.map((layer) => layer.handle);

test('Y1/Y5 agent sales reads use exact token chain and shared read limiter', () => {
  const router = express.Router();
  register(router, { auth, verifyRoleFromDB, agentMiddleware });
  assert.deepEqual(handlers(router, '/sales'), [
    auth, verifyRoleFromDB, agentMiddleware, limiter, history.listSales,
  ]);
  assert.deepEqual(handlers(router, '/customers'), [
    auth, verifyRoleFromDB, agentMiddleware, limiter, history.listCustomers,
  ]);
});
