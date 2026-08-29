'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const lifecycle = require('../../../src/modules/bus-owner/agent-assignment-lifecycle');
const options = require('../../../src/modules/bus-owner/agent-assignment-options');
const listLimiter = require('../../../middleware/busOwnerAgentAssignmentListRateLimit');
const writeLimiter = require('../../../middleware/busOwnerAgentAssignmentLifecycleRateLimit');
const createLimiter = require('../../../middleware/busOwnerAgentCreateRateLimit');
const invite = require('../../../src/modules/bus-owner/agent-invite');
const salesLimiter = require('../../../middleware/agentSalesReadRateLimit');
const ownerSales = require('../../../src/modules/bus-owner/agent-sales');
const { registerBusOwnerAgentRoutes } = require('../../../routes/busOwner/agentRoutes');

const handlersFor = (router, path, method) => router.stack
  .find((layer) => layer.route?.path === path && layer.route.methods[method])
  .route.stack.map((layer) => layer.handle);

test('T9 operator assignment lifecycle route wiring and rate limits', async (t) => {
  const router = express.Router();
  registerBusOwnerAgentRoutes(router);

  await t.test('X8 agent creation has its owner-keyed write limiter', () => {
    assert.deepEqual(handlersFor(router, '/agents', 'post'), [
      createLimiter, invite.createAgent,
    ]);
  });

  await t.test('list has its read limiter and controller', () => {
    assert.deepEqual(handlersFor(router, '/agents/assignments', 'get'), [
      listLimiter, lifecycle.listAssignments,
    ]);
  });

  await t.test('assignment options use the owner-keyed read limiter', () => {
    assert.deepEqual(handlersFor(router, '/agents/assignment-options', 'get'), [
      listLimiter, options.listOptions,
    ]);
  });

  await t.test('Y2 owner agent sales uses owner-keyed read limiter and controller', () => {
    assert.deepEqual(handlersFor(router, '/agents/:agentId/sales', 'get'), [
      salesLimiter, ownerSales.listSales,
    ]);
  });

  for (const action of ['suspend', 'reinstate', 'revoke']) {
    await t.test(`${action} shares the lifecycle write limiter`, () => {
      assert.deepEqual(handlersFor(
        router,
        `/agents/assignments/:assignmentId/${action}`,
        'patch',
      ), [writeLimiter, lifecycle[`${action}Assignment`]]);
    });
  }
});
