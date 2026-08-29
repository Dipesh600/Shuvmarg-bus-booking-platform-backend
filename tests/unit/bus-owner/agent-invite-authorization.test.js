'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { busOwnerMiddleware } = require('../../../middleware/checkRole');
const service = require('../../../src/modules/bus-owner/agent-invite/bus-owner-agent-invite.service');
const controller = require('../../../src/modules/bus-owner/agent-invite/bus-owner-agent-invite.controller');

const response = () => ({
  statusCode: null,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test('X1 non-owner roles are rejected with 403 before agent creation', () => {
  for (const activeRole of ['agent', 'passenger', 'admin']) {
    const res = response();
    let continued = false;
    busOwnerMiddleware({ userInfo: { activeRole } }, res, () => { continued = true; });
    assert.equal(res.statusCode, 403, activeRole);
    assert.equal(continued, false, activeRole);
  }
});

test('X1 create actor is the verified token id, never a body owner id', async () => {
  const original = service.createAgent;
  const calls = [];
  service.createAgent = async (...args) => {
    calls.push(args);
    return { statusCode: 200, responseBody: { success: true } };
  };
  const res = response();
  try {
    await controller.createAgent({
      userInfo: { id: 'owner-from-token' },
      body: { ownerId: 'owner-from-body', createdByOwnerId: 'body-creator' },
    }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 200);
    assert.equal(calls[0][0], 'owner-from-token');
    assert.equal(calls[0][1].ownerId, 'owner-from-body');
  } finally {
    service.createAgent = original;
  }
});
