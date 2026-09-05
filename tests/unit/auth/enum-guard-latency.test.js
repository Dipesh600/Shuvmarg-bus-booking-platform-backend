'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const enumGuard = require('../../../utils/enumGuard');

test('minimum-latency guard pads rejected eligibility checks too', async () => {
  const started = Date.now();
  await assert.rejects(
    enumGuard.withMinimumLatency(async () => { throw new Error('not eligible'); }, 40),
    /not eligible/,
  );
  assert.ok(Date.now() - started >= 35);
});
