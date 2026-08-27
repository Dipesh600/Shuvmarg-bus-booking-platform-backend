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
  busName: brandId === BRAND_A ? 'Kaski Express' : 'Gandaki Express',
  busNumber: brandId === BRAND_A ? 'GA-1-KHA-1000' : 'GA-1-KHA-2000',
  busType: 'DELUXE',
  vehicleType: 'bus',
  ...over,
});

const trip = (brandId = BRAND_A, over = {}) => ({
  _id: `trip-${brandId}`,
  brandId,
  ownerId: OWNER_ID,
  busId: bus(brandId),
  routeId: { _id: `route-${brandId}`, routeName: 'KTM-PKR', from: 'Kathmandu', to: 'Pokhara' },
  scheduleId: `recurring-${brandId}`,
  tripDate: new Date('2099-09-01T00:00:00.000Z'),
  departureTime: '07:00',
  arrivalTime: '14:00',
  shift: 'day',
  status: 'scheduled',
  isActive: true,
  tripFare: null,
  ...over,
});

const fareRule = (brandId = BRAND_A) => ({
  fleetId: `bus-${brandId}`,
  routeId: `route-${brandId}`,
  baseFare: 1000,
  seatClassPremium: { window: 50, aisle: 0, sleeper: 100 },
  advanceDiscount: { enabled: false, daysBeforeTravel: 7, discountPercent: 0 },
  peakPricing: { enabled: false, surchargePercent: 0 },
});

const availability = (brandId = BRAND_A) => ({
  seatDocs: [{
    tripId: `trip-${brandId}`,
    seata: [{ seatNo: 'A1', booked: false, blockedFor: 'none' }],
    seatb: [{ seatNo: 'B1', booked: true, blockedFor: 'none' }],
    seatc: [],
  }],
  holds: [],
});

const CALLS = [
  'findAgentForUser', 'findSellableAssignments', 'countSellableAssignments',
  'findTripsForAssignment', 'findFareRulesForTrips', 'findAvailabilityForTrips',
];
const DEFAULTS = {
  findAgentForUser: () => agent(),
  findSellableAssignments: () => [assignment()],
  countSellableAssignments: () => 1,
  findTripsForAssignment: () => [trip()],
  findFareRulesForTrips: () => [fareRule()],
  findAvailabilityForTrips: () => availability(),
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
  agent, assignment, availability, bus, fareRule, harness, rejects, trip, service,
};
