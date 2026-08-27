'use strict';

const errors = require('../../src/modules/agent/cash-sale/agent-cash-sale.errors');
const mapper = require('../../src/modules/agent/cash-sale/agent-cash-sale.mapper');
const parse = require('../../src/modules/agent/cash-sale/agent-cash-sale.parse');
const { createAgentCashSaleService } = require('../../src/modules/agent/cash-sale/agent-cash-sale.service');
const compensation = require('../../src/modules/agent/cash-sale/agent-cash-sale.compensation');

const USER_ID = '64b000000000000000000001';
const AGENT_ID = '64b000000000000000000002';
const HOLD_ID = '64b000000000000000000003';
const TRIP_ID = '64b000000000000000000004';
const BRAND_ID = '64b000000000000000000005';
const BOOKING_ID = '64b000000000000000000006';
const AGENT_BOOKING_ID = '64b000000000000000000007';
const NOW = new Date('2026-08-27T12:00:00.000Z');

const validBody = (over = {}) => ({
  holdId: HOLD_ID,
  passengerName: 'Sita Rai',
  passengerPhone: '9800000000',
  boardingPoint: 'Kalanki',
  droppingPoint: 'Pokhara',
  ticketPrice: 1200,
  ...over,
});

const build = (over = {}) => {
  const calls = [];
  const hold = {
    _id: HOLD_ID,
    userId: USER_ID,
    tripId: TRIP_ID,
    seatNumbers: ['a1'],
    originalAmount: 1000,
    expiresAt: new Date('2026-08-27T12:05:00.000Z'),
    heldExpiresAt: new Date('2026-08-27T12:05:00.000Z'),
    authorizedBrandId: BRAND_ID,
  };
  const trip = { _id: TRIP_ID, brandId: BRAND_ID, busId: 'bus-1', departureTime: '07:00' };
  const repository = {
    findAgentForUser: async (id) => (calls.push(['agent', id]), { _id: AGENT_ID }),
    claimOwnedAgentHold: async (...args) => (calls.push(['claim', ...args]), hold),
    findOwnedHoldState: async (...args) => (calls.push(['state', ...args]), null),
    findTripContext: async (id) => (calls.push(['trip', id]), trip),
    createAgentBooking: async (payload) => (calls.push(['agentBooking', payload]), payload),
    deleteAgentBooking: async (id) => calls.push(['deleteAgentBooking', id]),
  };
  const deps = {
    bookingPersistence: { persistAgentCashBooking: async (payload) => {
      calls.push(['booking', payload]);
      return { booking: { _id: BOOKING_ID, status: 'booked' } };
    } },
    clock: () => NOW,
    compensate: compensation.compensate,
    createId: (() => { const ids = [BOOKING_ID, AGENT_BOOKING_ID]; return () => ids.shift(); })(),
    errors, mapper, parse, repository,
    passengerSeatHold: {
      completePassengerHold: async (input) => calls.push(['complete', input]),
      restorePassengerHoldAfterFailedConfirmation: async (input) => calls.push(['restore', input]),
    },
    seatCommitment: {
      commitPassengerSeats: async (input) => (calls.push(['lock', input]), { ok: true }),
      rollbackPassengerSeatLocks: async (input) => calls.push(['rollback', input]),
    },
    ...over,
  };
  return { calls, deps, hold, service: createAgentCashSaleService(deps), trip };
};

module.exports = {
  AGENT_BOOKING_ID, AGENT_ID, BOOKING_ID, BRAND_ID, HOLD_ID, NOW, TRIP_ID, USER_ID,
  build, validBody,
};
