'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const routes = require('../../routes/ticketRoutes/ticketRoutes');
const auth = require('../../middleware/authMiddleware');
const verifyRoleFromDB = require('../../middleware/verifyRoleFromDB');
const seatHold = require(
  '../../src/modules/booking/passenger-seat-hold'
);
const checkout = require(
  '../../src/modules/booking/passenger-esewa-checkout'
);

const layers = routes.stack.filter((layer) => layer.route);
const findPost = (routePath) => layers.filter(
  (layer) => layer.route.path === routePath && layer.route.methods.post
);
const handlers = (layer) =>
  layer.route.stack.map((entry) => entry.handle);

test('purchase approval endpoints require a current passenger and an owned hold for issuing codes', () => {
  for (const path of ['/payment-authorization/request', '/payment-authorization/approve']) {
    const route = findPost(path);
    assert.equal(route.length, 1);
    const chain = handlers(route[0]);
    assert.equal(chain[0], auth);
    assert.equal(chain[1], verifyRoleFromDB);
    assert.equal(chain.length, path.endsWith('/request') ? 5 : 4);
    if (path.endsWith('/request')) assert.equal(chain[3], seatHold.requireOwnedActivePassengerSeatHold);
  }
});

test('secure eSewa checkout routes use passenger ownership guards', () => {
  const initiation = findPost('/esewa/initiate');
  const finalization = findPost('/esewa/finalize');
  assert.equal(initiation.length, 1);
  assert.equal(finalization.length, 1);

  const initiationHandlers = handlers(initiation[0]);
  assert.equal(initiationHandlers.length, 5);
  assert.equal(initiationHandlers[0], auth);
  assert.equal(initiationHandlers[1], verifyRoleFromDB);
  assert.equal(
    initiationHandlers[3],
    seatHold.requireOwnedActivePassengerSeatHold
  );
  assert.equal(
    initiationHandlers[4],
    checkout.initiatePassengerEsewaCheckout
  );

  const finalizationHandlers = handlers(finalization[0]);
  assert.equal(finalizationHandlers.length, 4);
  assert.equal(finalizationHandlers[0], auth);
  assert.equal(finalizationHandlers[1], verifyRoleFromDB);
  assert.equal(
    finalizationHandlers[3],
    checkout.finalizePassengerEsewaCheckout
  );
});

test('obsolete standalone eSewa verification implementation is deleted', () => {
  for (const relative of [
    'routes/paymentRoutes/paymentRoutes.js',
    'controllers/esewaPaymentVerification/esewaPaymentVerification.js',
    'services/esewaService.js',
  ]) {
    assert.equal(
      fs.existsSync(path.resolve(__dirname, '../..', relative)),
      false,
      relative
    );
  }
  const indexSource = fs.readFileSync(
    path.resolve(__dirname, '../../routes/indexRoute.js'),
    'utf8'
  );
  assert.equal(indexSource.includes('/api/payment'), false);
});
