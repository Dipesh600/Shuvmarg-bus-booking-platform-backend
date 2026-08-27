'use strict';

const assert = require('node:assert/strict');
const repository = require('../../src/modules/bus-owner/agent-assignment-lifecycle/bus-owner-agent-assignment-lifecycle.repository');
const service = require('../../src/modules/bus-owner/agent-assignment-lifecycle/bus-owner-agent-assignment-lifecycle.service');

const OWNER_ID = '507f1f77bcf86cd799439011';
const OTHER_OWNER_ID = '507f1f77bcf86cd799439012';
const ASSIGNMENT_ID = '507f1f77bcf86cd799439044';
const BRAND_ID = '507f1f77bcf86cd799439030';
const AGENT_ID = '507f1f77bcf86cd799439022';

const assignment = (over = {}) => ({
  _id: ASSIGNMENT_ID,
  ownerId: OWNER_ID,
  operatorId: { _id: BRAND_ID, brandName: 'Kaski Yatayat' },
  agentId: {
    _id: AGENT_ID,
    code: 'SM-AG-MAVSKNF',
    scope: 'OPERATOR',
    applicationStatus: 'VERIFIED_BASIC',
    outletType: 'TRAVEL_AGENCY',
    businessName: 'Himalaya Travels',
    district: 'Kathmandu',
    municipality: 'Kathmandu Metropolitan City',
    user: { name: 'Ram Bahadur', phoneVerified: true },
  },
  status: 'ACTIVE',
  invitedAt: new Date('2026-08-20T10:00:00.000Z'),
  expiresAt: new Date('2026-08-27T10:00:00.000Z'),
  acceptedAt: new Date('2026-08-21T10:00:00.000Z'),
  declinedAt: null,
  suspendedAt: null,
  revokedAt: null,
  statusReason: null,
  operatorNote: null,
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

const CALLS = ['listAssignments', 'transitionAssignment', 'findAssignmentState'];
const DEFAULTS = {
  listAssignments: () => ({ rows: [assignment()], total: 1 }),
  transitionAssignment: (_filter, update) => assignment(update),
  findAssignmentState: () => null,
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
  await assert.rejects(promise, (error) => {
    assert.equal(error.statusCode, statusCode);
    if (errorCode) assert.equal(error.responseBody.errorCode, errorCode);
    return true;
  });
};

module.exports = {
  ASSIGNMENT_ID,
  BRAND_ID,
  OTHER_OWNER_ID,
  OWNER_ID,
  assignment,
  harness,
  rejects,
  service,
};
