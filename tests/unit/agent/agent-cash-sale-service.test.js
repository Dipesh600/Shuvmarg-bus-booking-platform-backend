'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../../helpers/agent-seat-sale-harness');
const { createAgentCashSaleService } = require('../../../src/modules/agent/cash-sale/agent-cash-sale.service');

test('V4/V5/V6 own active hold creates linked Booking and null-money AgentBooking', async () => {
  const x = h.build();
  const result = await x.service.commitSale(h.USER_ID, h.validBody());
  const bridge = x.calls.find(([name]) => name === 'agentBooking')[1];
  const booking = x.calls.find(([name]) => name === 'booking')[1];
  assert.equal(bridge._id, h.AGENT_BOOKING_ID);
  assert.equal(bridge.bookingId, h.BOOKING_ID);
  assert.equal(bridge.paymentMode, 'CASH');
  assert.deepEqual(
    [bridge.commissionRate, bridge.commissionAmount, bridge.commissionStatus, bridge.settlementId],
    [null, null, null, null],
  );
  assert.equal(booking.bookingId, h.BOOKING_ID);
  assert.equal(booking.agentBookingId, h.AGENT_BOOKING_ID);
  assert.equal(booking.agentId, h.AGENT_ID);
  assert.equal(booking.passengerName, 'Sita Rai');
  assert.equal(result.statusCode, 200);
});

test('V4 hostile channel, payment and commission fields are ignored', async () => {
  const x = h.build();
  await x.service.commitSale(h.USER_ID, h.validBody({
    agentId: 'hostile', bookedVia: 'APP', paymentMethod: 'ESEWA',
    commissionAmount: 999, settlementId: 'hostile',
  }));
  const bridge = x.calls.find(([name]) => name === 'agentBooking')[1];
  const booking = x.calls.find(([name]) => name === 'booking')[1];
  assert.equal(bridge.agentId, h.AGENT_ID);
  assert.equal(bridge.commissionAmount, null);
  assert.equal(bridge.settlementId, null);
  assert.equal(booking.agentId, h.AGENT_ID);
  assert.equal('bookedVia' in booking, false);
  assert.equal('paymentMethod' in booking, false);
});

test('V8 partial seat-commit failure rolls back and restores the hold', async () => {
  const x = h.build();
  x.deps.seatCommitment.commitPassengerSeats = async () => ({ ok: false });
  const service = createAgentCashSaleService(x.deps);
  await assert.rejects(() => service.commitSale(h.USER_ID, h.validBody()), (e) => e.responseBody.errorCode === 'SEAT_UNAVAILABLE');
  assert.equal(x.calls.some(([name]) => name === 'rollback'), true);
  assert.equal(x.calls.some(([name]) => name === 'restore'), true);
  assert.equal(x.calls.some(([name]) => name === 'booking'), false);
});

test('V5 booking failure deletes bridge, unlocks seats and restores hold', async () => {
  const x = h.build();
  const failure = new Error('booking failed');
  x.deps.bookingPersistence.persistAgentCashBooking = async () => { throw failure; };
  const service = createAgentCashSaleService(x.deps);
  await assert.rejects(() => service.commitSale(h.USER_ID, h.validBody()), (e) => e === failure);
  assert.equal(x.calls.some(([name]) => name === 'deleteAgentBooking'), true);
  assert.equal(x.calls.some(([name]) => name === 'rollback'), true);
  assert.equal(x.calls.some(([name]) => name === 'restore'), true);
});

test('V9 response is a narrow field-by-field sale confirmation', async () => {
  const x = h.build();
  x.trip.ownerId = 'secret-owner';
  x.trip.operatorPhone = 'secret-phone';
  const result = await x.service.commitSale(h.USER_ID, h.validBody());
  const json = JSON.stringify(result.responseBody);
  assert.deepEqual(Object.keys(result.responseBody.data).sort(), [
    'arrivalTime', 'bookingId', 'departureTime', 'from', 'passengerName',
    'passengerPhone', 'seatNumbers', 'status', 'to', 'tripDate', 'tripId',
  ].sort());
  for (const forbidden of ['secret-owner', 'secret-phone', 'commission', 'settlement', 'busschedules']) {
    assert.equal(json.includes(forbidden), false);
  }
});

test('V8 a committed Booking is never compensated by a later mapper failure', async () => {
  const x = h.build();
  x.deps.mapper = { ...x.deps.mapper, toResponse: () => { throw new Error('response failed'); } };
  const service = createAgentCashSaleService(x.deps);
  await assert.rejects(() => service.commitSale(h.USER_ID, h.validBody()), /response failed/);
  assert.equal(x.calls.some(([name]) => name === 'rollback'), false);
  assert.equal(x.calls.some(([name]) => name === 'deleteAgentBooking'), false);
});

test('V10 data errors map narrowly and unknown failures propagate', async () => {
  const cases = [
    [Object.assign(new Error('invalid'), { name: 'ValidationError', errors: { field: { message: 'bad field' } } }), 400],
    [Object.assign(new Error('duplicate'), { code: 11000 }), 409],
    [new Error('unknown'), 500],
  ];
  for (const [failure, status] of cases) {
    const x = h.build();
    x.deps.repository.createAgentBooking = async () => { throw failure; };
    const service = createAgentCashSaleService(x.deps);
    await assert.rejects(() => service.commitSale(h.USER_ID, h.validBody()), (error) => {
      if (status === 500) return error === failure;
      return error.statusCode === status;
    });
  }
});
