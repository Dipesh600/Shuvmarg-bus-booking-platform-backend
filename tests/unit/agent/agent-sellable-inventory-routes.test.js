'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('../../../routes/agentRoute/agentRoute');
const auth = require('../../../middleware/authMiddleware');
const verifyRoleFromDB = require('../../../middleware/verifyRoleFromDB');
const { agentMiddleware } = require('../../../middleware/checkRole');
const limiter = require('../../../middleware/agentSellableInventoryRateLimit');
const inventory = require('../../../src/modules/agent/sellable-inventory');

test('U7/U9 sellable inventory has the exact pre-KYC chain and read limiter', () => {
  const handlers = router.stack
    .find((layer) => layer.route?.path === '/sellable-inventory')
    .route.stack.map((layer) => layer.handle);
  assert.deepEqual(handlers, [
    auth, verifyRoleFromDB, agentMiddleware, limiter, inventory.listSellableInventory,
  ]);
});
