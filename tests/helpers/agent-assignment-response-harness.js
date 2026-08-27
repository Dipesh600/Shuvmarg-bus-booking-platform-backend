'use strict';

const assert = require('node:assert/strict');

const repository = require('../../src/modules/agent/assignment-response/agent-assignment-response.repository');
const service = require('../../src/modules/agent/assignment-response/agent-assignment-response.service');

const USER_ID = '507f1f77bcf86cd799439010';
const AGENT_ID = '507f1f77bcf86cd799439020';
const ASSIGNMENT_ID = '507f1f77bcf86cd799439040';
const BRAND_ID = '507f1f77bcf86cd799439030';

const assignment = (over = {}) => ({
  _id: ASSIGNMENT_ID,
  agentId: AGENT_ID,
  operatorId: { _id: BRAND_ID, brandName: 'Kaski Yatayat' },
  status: 'ACTIVE',
  acceptedAt: new Date(),
  declinedAt: null,
  statusReason: null,
  accessScope: 'ALL_BUSES',
  allowedRouteIds: [],
  allowedScheduleIds: [],
  permissions: {
    canSellCash: true,
    canSellOnline: true,
    canCancel: false,
    cancelWindowMins: 0,
    maxSeatsPerBooking: null,
    maxDiscountPct: 0,
  },
  operatorCommission: { mode: 'PERCENT', value: 5 },
  ...over,
});

const CALLS = [
  'findAgentIdForUser',
  'transitionInvite',
  'findAssignmentState',
  'expireStaleInvite',
  'listAssignments',
  'countAssignments',
];

const DEFAULTS = {
  findAgentIdForUser: () => ({ _id: AGENT_ID }),
  transitionInvite: (_filter, update) => assignment({ ...update }),
  findAssignmentState: () => null,
  expireStaleInvite: () => assignment({ status: 'EXPIRED' }),
  listAssignments: () => [assignment()],
  countAssignments: () => 1,
};

const harness = (overrides = {}) => {
  const originals = {};
  const calls = {};
  for (const name of CALLS) {
    originals[name] = repository[name];
    calls[name] = [];
    const result = Object.hasOwn(overrides, name) ? overrides[name] : DEFAULTS[name];
    repository[name] = async (...args) => {
      calls[name].push(args);
      return typeof result === 'function' ? result(...args) : result;
    };
  }
  return { calls, restore: () => Object.assign(repository, originals) };
};

const rejects = async (promise, statusCode, errorCode) => {
  let body;
  await assert.rejects(promise, (error) => {
    assert.equal(error.statusCode, statusCode);
    if (errorCode) assert.equal(error.responseBody.errorCode, errorCode);
    body = error.responseBody;
    return true;
  });
  return body;
};

module.exports = {
  AGENT_ID,
  ASSIGNMENT_ID,
  BRAND_ID,
  USER_ID,
  assignment,
  harness,
  rejects,
  service,
};
