'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { filterSellableTrips } = require('../../../src/shared/identity/agent-selling-guard');
const { ACCESS_SCOPES } = require('../../../src/shared/identity/agent-assignment-terms');
const { agentMiddleware } = require('../../../middleware/checkRole');

const BRAND_A = '64b000000000000000000001';
const BRAND_B = '64b000000000000000000002';
const OWNER_ID = '64b000000000000000000009';
const NOW = new Date('2026-08-27T10:00:00.000Z');

const makeTrip = (over = {}) => ({
  _id: 'trip-1',
  brandId: BRAND_A,
  ownerId: OWNER_ID,
  variantId: 'route-1',
  scheduleId: 'sched-1',
  status: 'scheduled',
  isActive: true,
  tripDate: new Date('2026-08-28T00:00:00.000Z'),
  bookingClosesAt: new Date('2026-08-28T05:00:00.000Z'),
  ...over,
});

const makeAssignment = (over = {}) => ({
  _id: 'asg-1',
  operatorId: BRAND_A,
  status: 'ACTIVE',
  accessScope: ACCESS_SCOPES.ALL_BUSES,
  allowedRouteIds: ['route-1'],
  allowedScheduleIds: ['sched-1'],
  ...over,
});

test('Test 31: Agent role authentication middleware verifies agent role on request', () => {
  let passed = false;
  const req = { userInfo: { activeRole: 'agent' } };
  const res = { status: () => ({ json: () => {} }) };
  agentMiddleware(req, res, () => { passed = true; });
  assert.equal(passed, true, 'Valid agent must pass agentMiddleware');
});

test('Test 32: Unauthorized roles cannot access partner agent workspace', () => {
  let statusCode = null;
  let responseData = null;
  const req = { userInfo: { activeRole: 'passenger' } };
  const res = {
    status: (code) => {
      statusCode = code;
      return { json: (data) => { responseData = data; } };
    },
  };
  agentMiddleware(req, res, () => { assert.fail('Must not invoke next() for unauthorized role'); });
  assert.equal(statusCode, 403, 'Unauthorized role must receive 403 Forbidden');
  assert.equal(responseData.errorCode, 'INSUFFICIENT_ROLE');
});

test('Test 33: Agent sees only assigned operators/brands in sellable inventory', () => {
  const asgA = makeAssignment({ operatorId: BRAND_A });
  const trips = [makeTrip({ _id: 't-A', brandId: BRAND_A }), makeTrip({ _id: 't-B', brandId: BRAND_B })];
  const sellable = filterSellableTrips({ assignment: asgA, trips, now: NOW });
  assert.equal(sellable.length, 1);
  assert.equal(sellable[0]._id, 't-A');
});

test('Test 34: Brand switching strictly isolates data and prevents sibling-brand leakage', () => {
  const asgA = makeAssignment({ operatorId: BRAND_A });
  const siblingTrip = makeTrip({ _id: 't-sibling', brandId: BRAND_B, ownerId: OWNER_ID });
  const sellable = filterSellableTrips({ assignment: asgA, trips: [siblingTrip], now: NOW });
  assert.deepEqual(sellable, [], 'Sibling brand with same ownerId must never leak into Brand A');
});

test('Test 35: Agent trip search filters by date, status and assignment scope', () => {
  const asgRoutes = makeAssignment({ accessScope: ACCESS_SCOPES.ROUTES, allowedRouteIds: ['route-1'] });
  const valid = makeTrip({ _id: 't-valid', variantId: 'route-1' });
  const wrongRoute = makeTrip({ _id: 't-wrong', variantId: 'route-2' });
  const inactive = makeTrip({ _id: 't-inactive', isActive: false });
  const past = makeTrip({ _id: 't-past', tripDate: new Date('2026-08-25T00:00:00.000Z') });
  const closed = makeTrip({ _id: 't-closed', bookingClosesAt: new Date('2026-08-27T09:00:00.000Z') });

  const result = filterSellableTrips({
    assignment: asgRoutes,
    trips: [valid, wrongRoute, inactive, past, closed],
    now: NOW,
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]._id, 't-valid');
});
