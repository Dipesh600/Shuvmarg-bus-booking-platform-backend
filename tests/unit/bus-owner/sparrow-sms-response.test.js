'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { queuedMessageCount } = require('../../../handlers/sparro-otp');

test('Sparrow success requires its documented code and a positive queued count', () => {
  assert.equal(queuedMessageCount({ response_code: 200, count: 1 }), 1);
  assert.equal(queuedMessageCount({ response_code: '200', count: '2' }), 2);
  assert.equal(queuedMessageCount({ response_code: 200 }), 0);
  assert.equal(queuedMessageCount({ count: 1 }), 0);
  assert.equal(queuedMessageCount({ response_code: 1001, count: 1 }), 0);
  assert.equal(queuedMessageCount({ response_code: 200, count: 0 }), 0);
});
