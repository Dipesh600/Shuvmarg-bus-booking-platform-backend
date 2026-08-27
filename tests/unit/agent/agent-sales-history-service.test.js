'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const logger = require('../../../utils/logger');
const errors = require('../../../src/shared/agent-sales/agent-sales.errors');
const mapper = require('../../../src/shared/agent-sales/agent-sales.mapper');
const parse = require('../../../src/shared/agent-sales/agent-sales.parse');
const { createService } = require('../../../src/modules/agent/sales-history/agent-sales-history.service');

const AGENT_A = '507f1f77bcf86cd799439011';
const deps = (over = {}) => {
  const calls = [];
  const repository = {
    findAgentForUser: async (...args) => { calls.push(['findAgent', ...args]); return { _id: AGENT_A }; },
    listSales: async (...args) => { calls.push(['listSales', ...args]); return { rows: [], total: 0 }; },
    listCustomers: async (...args) => {
      calls.push(['listCustomers', ...args]);
      return { rows: [], total: 0, truncatedSales: 0 };
    },
    ...over,
  };
  return { calls, service: createService({ errors, mapper, parse, repository }) };
};

test('Y1 agent sales scope comes from token user and ignores client agentId', async () => {
  const x = deps();
  await x.service.listSales('token-user', { agentId: 'attacker', page: '2', limit: '500' });
  assert.deepEqual(x.calls[0], ['findAgent', 'token-user']);
  assert.equal(x.calls[1][1].agentId, AGENT_A);
  assert.equal(x.calls[1][1].page, 2);
  assert.equal(x.calls[1][1].limit, 50);
});

test('Y5 malformed paging costs zero database calls', async () => {
  const x = deps();
  await assert.rejects(x.service.listSales('token-user', { page: '1001' }), (error) => {
    assert.equal(error.statusCode, 400);
    return true;
  });
  assert.deepEqual(x.calls, []);
});

test('Y5 customer truncation is explicit and identifies the dropped sales', async () => {
  const x = deps({
    listCustomers: async () => ({ rows: [], total: 0, truncatedSales: 7 }),
  });
  const original = logger.warn;
  let warning;
  logger.warn = (message, details) => { warning = { message, details }; };
  try {
    await x.service.listCustomers('token-user', {});
    assert.equal(warning.details.agentId, AGENT_A);
    assert.equal(warning.details.droppedSales, 7);
  } finally { logger.warn = original; }
});

test('Y6 ValidationError is 400 and an unknown read failure propagates', async () => {
  const validation = Object.assign(new Error('bad row'), {
    name: 'ValidationError', errors: { page: { message: 'bad row' } },
  });
  const invalid = deps({ listSales: async () => { throw validation; } });
  await assert.rejects(invalid.service.listSales('token-user', {}), (error) => error.statusCode === 400);

  const failure = new Error('database unavailable');
  const unknown = deps({ listSales: async () => { throw failure; } });
  await assert.rejects(unknown.service.listSales('token-user', {}), (error) => error === failure);
});
