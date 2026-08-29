'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const errors = require('../../../src/shared/agent-sales/agent-sales.errors');
const mapper = require('../../../src/shared/agent-sales/agent-sales.mapper');
const parse = require('../../../src/shared/agent-sales/agent-sales.parse');
const { createService } = require('../../../src/modules/bus-owner/agent-sales/owner-agent-sales.service');

const OWNER = '507f1f77bcf86cd799439010';
const AGENT = '507f1f77bcf86cd799439011';
const BRAND_A = '507f1f77bcf86cd799439012';

const setup = (brands = [BRAND_A]) => {
  const calls = [];
  const repository = {
    findOwnerBrandIds: async (...args) => { calls.push(['brands', ...args]); return brands; },
    listSales: async (...args) => { calls.push(['sales', ...args]); return { rows: [], total: 0 }; },
  };
  return { calls, service: createService({ errors, mapper, parse, repository }) };
};

test('Y2 owner scope is proven by assignment and only those brand ids reach sales query', async () => {
  const x = setup([BRAND_A]);
  await x.service.listSales(OWNER, AGENT, {});
  assert.deepEqual(x.calls[0], ['brands', OWNER, AGENT]);
  assert.deepEqual(x.calls[1][1].brandIds, [BRAND_A]);
});

test('Y2 an assignment miss returns 404 without probing whether the agent exists', async () => {
  const x = setup([]);
  await assert.rejects(x.service.listSales(OWNER, AGENT, {}), (error) => {
    assert.deepEqual(error.responseBody, {
      success: false, message: 'Agent sales were not found.', errorCode: 'AGENT_SALES_NOT_FOUND',
    });
    return true;
  });
  assert.deepEqual(x.calls, [['brands', OWNER, AGENT]]);
});

test('Y6 malformed agent id costs zero database calls and returns the same narrow 404', async () => {
  const x = setup();
  await assert.rejects(x.service.listSales(OWNER, 'not-an-id', {}), (error) => {
    assert.equal(error.statusCode, 404);
    assert.equal(error.responseBody.errorCode, 'AGENT_SALES_NOT_FOUND');
    return true;
  });
  assert.deepEqual(x.calls, []);
});
