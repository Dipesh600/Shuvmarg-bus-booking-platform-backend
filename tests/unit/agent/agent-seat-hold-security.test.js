'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { filterSellableTrips } = require('../../../src/shared/identity/agent-selling-guard');
const { permitsCashSale } = require('../../../src/shared/identity/agent-assignment-terms');
const { isAgentVerificationCleared } = require('../../../src/shared/identity/agent-verification');
const errors = require('../../../src/modules/agent/seat-hold/agent-seat-hold.errors');
const mapper = require('../../../src/modules/agent/seat-hold/agent-seat-hold.mapper');
const parse = require('../../../src/modules/agent/seat-hold/agent-seat-hold.parse');
const policy = require('../../../src/modules/booking/passenger-booking-preparation/passenger-booking-preparation.policy');
const { createAgentSeatHoldService } = require('../../../src/modules/agent/seat-hold/agent-seat-hold.service');

const USER = '64b000000000000000000001';
const TRIP = '64b000000000000000000002';
const BRAND = '64b000000000000000000003';
const NOW = new Date('2026-08-27T12:00:00.000Z');
const body = { tripId: TRIP, seatNumbers: ['A1'] };

const build = (over = {}) => {
  const calls = [];
  const trip = { _id: TRIP, brandId: BRAND, variantId: 'r1', scheduleId: 's1', status: 'scheduled', isActive: true,
    tripDate: new Date('2026-08-28'), bookingClosesAt: new Date('2026-08-28T06:00:00Z'), tripFare: 500 };
  const assignment = { _id: 'assignment-1', agentId: 'agent-1', operatorId: BRAND, status: 'ACTIVE',
    accessScope: 'ALL_BUSES', permissions: { canSellCash: true, maxSeatsPerBooking: null } };
  const repository = {
    findAgentForUser: async (id) => (calls.push(['agent', id]), { _id: 'agent-1', scope: 'OPERATOR', applicationStatus: 'VERIFIED_BASIC' }),
    findTripCandidate: async () => (calls.push(['trip']), trip),
    findActiveAssignments: async () => (calls.push(['assignments']), [assignment]),
    findLayoutPricing: async () => null,
    findSeatDocument: async () => ({ seata: [{ seatNo: 'A1', booked: false, blockedFor: 'none' }], seatb: [], seatc: [] }),
    authorizeHold: async (...args) => (calls.push(['authorize', ...args]), { _id: 'hold-1' }),
  };
  const passengerSeatHold = {
    normalizeSeatNumbers: (seats) => seats.map((seat) => seat.toLowerCase()),
    createOrReusePassengerSeatHold: async (input) => (calls.push(['hold', input]), { _id: 'hold-1', ...input, status: 'held', expiresAt: new Date('2026-08-27T12:05:00Z') }),
  };
  const deps = { clock: () => NOW, errors, filterSellableTrips, isAgentVerificationCleared, mapper, parse,
    passengerSeatHold, permitsCashSale, preparationPolicy: policy, repository, ...over };
  return { calls, repository, service: createAgentSeatHoldService(deps), trip };
};

test('V1/V10 malformed hold uses token identity and costs zero queries', async () => {
  const h = build();
  await assert.rejects(() => h.service.createHold(USER, { tripId: 'bad', seatNumbers: [] }), (e) => e.statusCode === 400);
  assert.deepEqual(h.calls, []);
});

test('V10 duplicate seats are rejected before the first repository query', async () => {
  const h = build({ passengerSeatHold: {
    normalizeSeatNumbers: () => { const error = errors.invalidInput(['Duplicate seat number.']); throw error; },
  } });
  await assert.rejects(() => h.service.createHold(USER, { tripId: TRIP, seatNumbers: ['A1', 'a1'] }), (e) => e.statusCode === 400);
  assert.deepEqual(h.calls, []);
});

test('V2 PHONE_VERIFIED fails KYC before inventory queries', async () => {
  const h = build();
  h.repository.findAgentForUser = async () => ({ _id: 'agent-1', scope: 'OPERATOR', applicationStatus: 'PHONE_VERIFIED' });
  await assert.rejects(() => h.service.createHold(USER, body), (e) => e.responseBody.errorCode === 'AGENT_NOT_VERIFIED');
  assert.equal(h.calls.some(([name]) => name === 'trip'), false);
});

test('V2 gate 1 rejects sibling brand, past and cancelled Trips', async () => {
  for (const patch of [{ brandId: 'sibling' }, { tripDate: new Date('2026-08-26') }, { status: 'cancelled' }]) {
    const h = build();
    h.repository.findTripCandidate = async () => ({ ...h.trip, ...patch });
    await assert.rejects(() => h.service.createHold(USER, body), (e) => e.responseBody.errorCode === 'NOT_SELLABLE_INVENTORY');
    assert.equal(h.calls.some(([name]) => name === 'hold'), false);
  }
});

test('V2 VERIFIED_BASIC plus shared Trip guard creates an authorized passenger hold', async () => {
  const h = build();
  const result = await h.service.createHold(USER, body);
  assert.equal(result.statusCode, 200);
  assert.deepEqual(h.calls.find(([name]) => name === 'authorize').slice(1), ['hold-1', USER, 'assignment-1', BRAND]);
  assert.equal(h.calls.find(([name]) => name === 'hold')[1].originalAmount, 500);
});

test('cash permission denial fails before seat, pricing or hold work', async () => {
  for (const permissions of [
    { canSellCash: false, maxSeatsPerBooking: null },
    { canSellCash: true, maxSeatsPerBooking: 1 },
  ]) {
    const h = build();
    h.repository.findActiveAssignments = async () => [{
      _id: 'assignment-1', operatorId: BRAND, status: 'ACTIVE',
      accessScope: 'ALL_BUSES', permissions,
    }];
    const request = permissions.maxSeatsPerBooking === 1
      ? { tripId: TRIP, seatNumbers: ['A1', 'A2'] }
      : body;
    await assert.rejects(() => h.service.createHold(USER, request), (error) =>
      error.responseBody.errorCode === 'NOT_SELLABLE_INVENTORY');
    assert.equal(h.calls.some(([name]) => name === 'hold'), false);
    assert.equal(h.calls.some(([name]) => name === 'authorize'), false);
  }
});

test('V10 hold data errors map ValidationError to 400 and duplicate key to 409', async () => {
  for (const [failure, status] of [
    [Object.assign(new Error('invalid'), { name: 'ValidationError', errors: { field: { message: 'bad field' } } }), 400],
    [Object.assign(new Error('duplicate'), { code: 11000 }), 409],
  ]) {
    const h = build();
    h.repository.findAgentForUser = async () => { throw failure; };
    await assert.rejects(() => h.service.createHold(USER, body), (error) => error.statusCode === status);
  }
});
