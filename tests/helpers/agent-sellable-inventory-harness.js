'use strict';

const assert = require('node:assert/strict');
const repository = require('../../src/modules/agent/sellable-inventory/agent-sellable-inventory.repository');
const service = require('../../src/modules/agent/sellable-inventory/agent-sellable-inventory.service');

const USER_ID = '507f1f77bcf86cd799439010';
const AGENT_ID = '507f1f77bcf86cd799439020';
const OWNER_ID = '507f1f77bcf86cd799439011';
const BRAND_A = '507f1f77bcf86cd799439030';
const BRAND_B = '507f1f77bcf86cd799439031';

const agent = (over = {}) => ({
  _id: AGENT_ID,
  scope: 'OPERATOR',
  applicationStatus: 'VERIFIED_BASIC',
  outletType: 'TRAVEL_AGENCY',
  district: 'Kathmandu',
  municipality: 'Kathmandu Metropolitan City',
  user: { phoneVerified: true },
  ...over,
});

const assignment = (brandId = BRAND_A, over = {}) => ({
  _id: `assignment-${brandId}`,
  agentId: AGENT_ID,
  operatorId: { _id: brandId, brandName: brandId === BRAND_A ? 'Kaski Yatayat' : 'Gandaki Deluxe' },
  ownerId: OWNER_ID,
  status: 'ACTIVE',
  accessScope: 'ALL_BUSES',
  allowedRouteIds: [],
  allowedScheduleIds: [],
  permissions: { canSellCash: true, canSellOnline: true },
  operatorCommission: { mode: 'PERCENT', value: 5 },
  ...over,
});

const bus = (brandId = BRAND_A, over = {}) => ({
  _id: `bus-${brandId}`,
  brandId,
  ownerId: OWNER_ID,
  approvalStatus: 'APPROVED',
  status: 'ACTIVE',
  busName: brandId === BRAND_A ? 'Kaski Express' : 'Gandaki Express',
  busNumber: brandId === BRAND_A ? 'GA-1-KHA-1000' : 'GA-1-KHA-2000',
  busType: 'DELUXE',
  vehicleType: 'bus',
  ...over,
});

const schedule = (brandId = BRAND_A, over = {}) => ({
  _id: `schedule-${brandId}`,
  busId: `bus-${brandId}`,
  routeId: { _id: `route-${brandId}`, name: 'Kathmandu to Pokhara' },
  busRouteId: { _id: `service-${brandId}`, routeName: 'KTM-PKR', from: 'Kathmandu', to: 'Pokhara' },
  departureTime: '07:00 AM',
  arrivalTime: '02:00 PM',
  date: '2026-09-01',
  totalTimeTaken: '7h',
  shift: 'day',
  yatrapoints: 100,
  isActive: true,
  ...over,
});

const fareRule = (brandId = BRAND_A) => ({
  fleetId: `bus-${brandId}`,
  routeId: `service-${brandId}`,
  baseFare: 1000,
  seatClassPremium: { window: 50, aisle: 0, sleeper: 100 },
  advanceDiscount: { enabled: false, daysBeforeTravel: 7, discountPercent: 0 },
  peakPricing: { enabled: false, surchargePercent: 0 },
});

const CALLS = [
  'findAgentForUser', 'findSellableAssignments', 'findApprovedBusesForAssignment',
  'findSchedulesForBuses', 'findFareRulesForSchedules',
];
const DEFAULTS = {
  findAgentForUser: () => agent(),
  findSellableAssignments: () => [assignment()],
  findApprovedBusesForAssignment: () => [bus()],
  findSchedulesForBuses: () => [schedule()],
  findFareRulesForSchedules: () => [fareRule()],
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

const rejects = async (promise, statusCode, errorCode) => assert.rejects(promise, (error) => {
  assert.equal(error.statusCode, statusCode);
  if (errorCode) assert.equal(error.responseBody.errorCode, errorCode);
  return true;
});

module.exports = {
  AGENT_ID, BRAND_A, BRAND_B, OWNER_ID, USER_ID,
  agent, assignment, bus, fareRule, harness, rejects, schedule, service,
};
