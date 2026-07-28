'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  requireServerOwnedEsewaCheckout,
} = require(
  '../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.middleware'
);

function response() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('direct eSewa confirmation is rejected before confirmation orchestration', () => {
  const res = response();
  let nextCalled = false;
  requireServerOwnedEsewaCheckout(
    { body: { gateway: 'esewa' } },
    res,
    () => { nextCalled = true; }
  );
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.errorCode, 'ESEWA_CHECKOUT_REQUIRED');
  assert.equal(nextCalled, false);
});

test('wallet confirmation remains available', () => {
  const res = response();
  let nextCalled = false;
  requireServerOwnedEsewaCheckout(
    { body: { gateway: 'wallet' } },
    res,
    () => { nextCalled = true; }
  );
  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);
});
