'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateBookingTicketId,
  buildCommittedBookingResponse,
} = require('../../../src/modules/booking/booking-confirmation/booking-confirmation.service');

test('Booking Confirmation Service Contracts', async (t) => {
  await t.test('Ticket-ID: deterministic format with injected now and random', () => {
    const id = generateBookingTicketId({
      now: new Date('2026-07-23T10:00:00.000Z'),
      random: () => 0,
    });
    assert.equal(id, 'TKT-20260723-1000');
  });

  await t.test('Ticket-ID: production call uses current date and Math.random', () => {
    const id = generateBookingTicketId();
    assert.match(id, /^TKT-\d{8}-\d{4,5}$/);
  });

  await t.test('Committed response: complete object with all fields', () => {
    const booking = { _id: 'booking-001' };
    const result = buildCommittedBookingResponse(booking, 'TKT-001', {
      originalAmount: 1000,
      discountAmount: 100,
      smMoneyApplied: 50,
      gatewayAmount: 850,
      finalAmount: 900,
      appliedCouponCode: 'SAVE10',
      paymentId: 'pay-123',
      gateway: 'esewa',
      normalizedSeats: ['a1', 'b2'],
      scratchCardId: 'sc-456',
    });

    assert.deepEqual(result, {
      success: true,
      message: 'Booking confirmed successfully!',
      data: {
        bookingId: 'booking-001',
        ticketId: 'TKT-001',
        originalAmount: 1000,
        discountAmount: 100,
        smMoneyUsed: 50,
        gatewayAmount: 850,
        totalAmount: 900,
        couponUsed: 'SAVE10',
        savings: 10,
        paymentId: 'pay-123',
        gateway: 'esewa',
        seats: ['a1', 'b2'],
        scratchCardId: 'sc-456',
      },
    });
  });

  await t.test('No-discount: savings is 0 when discountAmount is 0', () => {
    const result = buildCommittedBookingResponse({ _id: 'b-2' }, 'TKT-002', {
      originalAmount: 500,
      discountAmount: 0,
      smMoneyApplied: 0,
      gatewayAmount: 500,
      finalAmount: 500,
      appliedCouponCode: null,
      paymentId: 'pay-456',
      gateway: 'esewa',
      normalizedSeats: ['c3'],
      scratchCardId: null,
    });

    assert.equal(result.data.savings, 0);
  });

  await t.test('Nullable fields: missing couponCode → null; missing scratchCardId → null', () => {
    const result = buildCommittedBookingResponse({ _id: 'b-3' }, 'TKT-003', {
      originalAmount: 800,
      discountAmount: 0,
      smMoneyApplied: 0,
      gatewayAmount: 800,
      finalAmount: 800,
      appliedCouponCode: undefined,
      paymentId: 'pay-789',
      gateway: 'esewa',
      normalizedSeats: ['d4'],
      scratchCardId: undefined,
    });

    assert.equal(result.data.couponUsed, null);
    assert.equal(result.data.scratchCardId, null);
  });

  await t.test('Savings formula: two-decimal rounding', () => {
    const result = buildCommittedBookingResponse({ _id: 'b-4' }, 'TKT-004', {
      originalAmount: 300,
      discountAmount: 10,
      smMoneyApplied: 0,
      gatewayAmount: 290,
      finalAmount: 290,
      appliedCouponCode: null,
      paymentId: 'pay-000',
      gateway: 'esewa',
      normalizedSeats: ['e5'],
      scratchCardId: null,
    });

    // 10/300 * 100 = 3.333... → rounded to 3.33
    assert.equal(result.data.savings, 3.33);
  });
});
