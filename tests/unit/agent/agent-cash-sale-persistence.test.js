'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bookingMapper = require('../../../src/modules/booking/passenger-booking-persistence/agent-cash-booking-persistence.mapper');
const { createAgentCashBookingPersistenceService } = require('../../../src/modules/booking/passenger-booking-persistence/agent-cash-booking-persistence.service');
const saleMapper = require('../../../src/modules/agent/cash-sale/agent-cash-sale.mapper');
const h = require('../../helpers/agent-seat-sale-harness');

test('V4/V5/V6 shared persistence maps one AGENT CASH Booking and passenger per seat', async () => {
  let payload;
  const service = createAgentCashBookingPersistenceService({
    repository: { createBooking: async (value) => (payload = value, { _id: value._id }) },
    mapper: bookingMapper,
    generateTicketId: () => 'TICKET-1',
  });
  const result = await service.persistAgentCashBooking({
    bookingId: h.BOOKING_ID,
    agentBookingId: h.AGENT_BOOKING_ID,
    agentId: h.AGENT_ID,
    userId: h.USER_ID,
    trip: { _id: h.TRIP_ID, brandId: h.BRAND_ID, busId: 'bus-1' },
    seatNumbers: ['a1', 'a2'],
    passengerName: 'Sita',
    passengerPhone: '9800000000',
    originalAmount: 1000,
  });
  assert.equal(result.booking._id, h.BOOKING_ID);
  assert.equal(payload.bookedVia, 'AGENT');
  assert.equal(payload.paymentMethod, 'CASH');
  assert.equal(payload.transactionId, null);
  assert.equal(payload.agentId, h.AGENT_ID);
  assert.equal(payload.agentBookingId, h.AGENT_BOOKING_ID);
  assert.deepEqual(payload.passengerDetails.map((p) => [p.name, p.phone, p.seatNo]), [
    ['Sita', '9800000000', 'a1'], ['Sita', '9800000000', 'a2'],
  ]);
});

test('V4 hostile money fields never enter AgentBooking', () => {
  const input = { ...h.validBody(), commissionAmount: 999, settlementId: 'hostile', paymentMode: 'ONLINE' };
  const payload = saleMapper.toAgentBooking(input, {
    agentId: h.AGENT_ID, agentBookingId: h.AGENT_BOOKING_ID, bookingId: h.BOOKING_ID,
  });
  assert.equal(payload.paymentMode, 'CASH');
  assert.equal(payload.commissionRate, null);
  assert.equal(payload.commissionAmount, null);
  assert.equal(payload.commissionStatus, null);
  assert.equal(payload.settlementId, null);
});

test('V5 persistence is payload-only and propagates create failure without payment context', async () => {
  const failure = new Error('write failed');
  const service = createAgentCashBookingPersistenceService({
    repository: { createBooking: async () => { throw failure; } }, mapper: bookingMapper, generateTicketId: () => 'T1',
  });
  await assert.rejects(() => service.persistAgentCashBooking({
    trip: {}, seatNumbers: [], passengerName: 'Sita',
  }), (error) => error === failure);
});
