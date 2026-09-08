'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const router = require('../../routes/adminRoutes/adminRoutes');
const admin = require('../../middleware/adminMiddleware');
const finance = require('../../middleware/requireFinanceAdmin');
test('mounted money-changing routes enforce database admin authentication followed by finance MFA authority', () => {
  const paths = ['/settlements/pay', '/payments/review', '/wallet/adjust', '/wallet/freeze',
    '/refund/update-status', '/disputes/:transactionId/resolve', '/refund-policy/create',
    '/refund-policy/update', '/refund-policy/delete', '/refund-policy/toggleStatus'];
  for (const path of paths) {
    const layers = router.stack.filter(layer => layer.route?.path === path);
    assert.equal(layers.length, 1, path);
    const handlers = layers[0].route.stack.map(layer => layer.handle);
    assert.equal(handlers[0], admin, `${path}: authentication first`);
    assert.equal(handlers[1], finance, `${path}: finance authority before handler`);
  }
});
