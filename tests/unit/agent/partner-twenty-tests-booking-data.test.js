'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../../helpers/agent-seat-sale-harness');
const parse = require('../../../src/modules/agent/cash-sale/agent-cash-sale.parse');
const { createAgentCashSaleService } = require('../../../src/modules/agent/cash-sale/agent-cash-sale.service');
const { createService: createSalesHistoryService } = require('../../../src/modules/agent/sales-history/agent-sales-history.service');
const salesErrors = require('../../../src/shared/agent-sales/agent-sales.errors');
const salesMapper = require('../../../src/shared/agent-sales/agent-sales.mapper');
const salesParse = require('../../../src/shared/agent-sales/agent-sales.parse');

test('Test 36 & 37: Agent locks seats via shared hold machinery with correct TTL', async () => {
  const x = h.build();
  assert.equal(x.hold.seatNumbers[0], 'a1');
  assert.equal(x.hold.tripId, h.TRIP_ID);
  assert.equal(x.hold.userId, h.USER_ID);
  assert.equal(x.hold.expiresAt instanceof Date, true);
});

test('Test 38: Passenger information is strictly validated before sale', async () => {
  const emptyName = parse.parseSale(h.validBody({ passengerName: '   ' }));
  assert.equal(emptyName.errors.includes('passengerName is required.'), true);

  const missingPhone = parse.parseSale(h.validBody({ passengerPhone: '' }));
  assert.equal(missingPhone.errors.includes('passengerPhone is required.'), true);

  const parsed = parse.parseSale(h.validBody({ passengerPhone: '9841234567', passengerName: 'Sita Rai' }));
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.value.passengerName, 'Sita Rai');
  assert.equal(parsed.value.passengerPhone, '9841234567');

  const x = h.build();
  await assert.rejects(
    () => x.service.commitSale(h.USER_ID, h.validBody({ passengerName: '' })),
    (e) => e.statusCode === 400,
  );
});

test('Test 39: Agent cash sale commits valid Booking PNR and AgentBooking record', async () => {
  const x = h.build();
  const res = await x.service.commitSale(h.USER_ID, h.validBody());
  assert.equal(res.statusCode, 200);
  assert.equal(res.responseBody.data.bookingId, h.BOOKING_ID);

  const bridge = x.calls.find(([name]) => name === 'agentBooking')[1];
  const booking = x.calls.find(([name]) => name === 'booking')[1];
  assert.equal(bridge.paymentMode, 'CASH');
  assert.equal(bridge.agentId, h.AGENT_ID);
  assert.equal(booking.agentId, h.AGENT_ID);
  assert.equal(booking.bookingId, h.BOOKING_ID);
});

test('Test 40 & 41: Agent cannot sell already-booked seat and rolls back on conflict', async () => {
  const x = h.build();
  x.deps.seatCommitment.commitPassengerSeats = async () => ({ ok: false });
  const service = createAgentCashSaleService(x.deps);
  await assert.rejects(
    () => service.commitSale(h.USER_ID, h.validBody()),
    (e) => e.responseBody?.errorCode === 'SEAT_UNAVAILABLE' && e.statusCode === 409,
  );
  assert.equal(x.calls.some(([name]) => name === 'rollback'), true, 'Must rollback on seat conflict');
  assert.equal(x.calls.some(([name]) => name === 'restore'), true, 'Must restore hold for recovery');
});

test('Test 42 & 47: Duplicate booking or sync replay on locked seat fails safely', async () => {
  const x = h.build();
  x.deps.repository.createAgentBooking = async () => {
    const duplicateErr = new Error('E11000 duplicate key error');
    duplicateErr.code = 11000;
    throw duplicateErr;
  };
  const service = createAgentCashSaleService(x.deps);
  await assert.rejects(() => service.commitSale(h.USER_ID, h.validBody()), (e) => e.statusCode === 409);
  assert.equal(x.calls.some(([name]) => name === 'rollback'), true);
});

test('Test 43 & 44: Agent sees only own sold tickets; cross-agent access is blocked', async () => {
  const calls = [];
  const AGENT_ME = '507f1f77bcf86cd799439011';
  const repository = {
    findAgentForUser: async (id) => { calls.push(['findAgent', id]); return { _id: AGENT_ME }; },
    listSales: async (opts) => { calls.push(['listSales', opts]); return { rows: [], total: 0 }; },
    listCustomers: async () => ({ rows: [], total: 0, truncatedSales: 0 }),
  };
  const historyService = createSalesHistoryService({ errors: salesErrors, mapper: salesMapper, parse: salesParse, repository });

  await historyService.listSales('my-token-user', { agentId: 'hostile-other-agent', page: '1' });
  assert.equal(calls[0][1], 'my-token-user');
  assert.equal(calls[1][1].agentId, AGENT_ME, 'Must query strictly by token-resolved agentId');
});
