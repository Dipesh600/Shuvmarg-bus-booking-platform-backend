'use strict';

const assert = require('node:assert/strict');

const repository = require('../../src/modules/bus-owner/agent-assign/bus-owner-agent-assign.repository');
const service = require('../../src/modules/bus-owner/agent-assign/bus-owner-agent-assign.service');

const OWNER_ID = '507f1f77bcf86cd799439011';
const BRAND_ID = '507f1f77bcf86cd799439030';
const AGENT_OBJECT_ID = '507f1f77bcf86cd799439022';
const VALID_CODE = 'SM-AG-MAVSKNF';

const validBody = (over = {}) => ({ agentCode: VALID_CODE, brandId: BRAND_ID, ...over });

const ownedBrand = (over = {}) => ({ _id: BRAND_ID, brandName: 'Kaski Yatayat', ...over });

const storedAgent = (over = {}) => ({
  _id: AGENT_OBJECT_ID,
  code: VALID_CODE,
  scope: 'OPERATOR',
  applicationStatus: 'DRAFT',
  outletType: 'TRAVEL_AGENCY',
  businessName: 'Himalaya Travels',
  district: 'Kathmandu',
  municipality: 'Kathmandu Metropolitan City',
  user: { name: 'Ram Bahadur', phoneVerified: true },
  ...over,
});

const savedAssignment = (over = {}) => ({
  _id: '507f1f77bcf86cd799439044',
  status: 'INVITED',
  invitedAt: new Date('2026-08-27T10:00:00.000Z'),
  expiresAt: new Date('2026-09-03T10:00:00.000Z'),
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
  operatorCommission: { mode: 'PERCENT', value: 0 },
  ...over,
});

const REPOSITORY_CALLS = [
  'findOwnedBrand',
  'findAgentByCodeFilter',
  'createAssignment',
  'findLiveAssignmentStatus',
];

const DEFAULT_RESULTS = {
  findOwnedBrand: () => ownedBrand(),
  findAgentByCodeFilter: () => storedAgent(),
  createAssignment: () => savedAssignment(),
  findLiveAssignmentStatus: () => 'ACTIVE',
};

/**
 * Patches every repository call and records the arguments each received, so a
 * test can assert not only the answer but which queries were and were not run —
 * the ordering of the ownership check against the agent read is a security
 * property, not an implementation detail.
 *
 * `undefined` in the overrides means "use the default"; pass `null` explicitly to
 * simulate a miss.
 */
const harness = (overrides = {}) => {
  const originals = {};
  const calls = {};

  for (const name of REPOSITORY_CALLS) {
    originals[name] = repository[name];
    calls[name] = [];
    const override = Object.hasOwn(overrides, name) ? overrides[name] : DEFAULT_RESULTS[name];
    repository[name] = async (...args) => {
      calls[name].push(args);
      return typeof override === 'function' ? override(...args) : override;
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
  AGENT_OBJECT_ID,
  BRAND_ID,
  OWNER_ID,
  VALID_CODE,
  harness,
  ownedBrand,
  rejects,
  savedAssignment,
  service,
  storedAgent,
  validBody,
};
