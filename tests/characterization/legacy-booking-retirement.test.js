'use strict';

/**
 * tests/characterization/legacy-booking-retirement.test.js
 *
 * Characterization test proving retirement of POST /api/ticket/bookTicket (410 Gone)
 * without requiring application startup or database connections.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const ticketRoutes = require('../../routes/ticketRoutes/ticketRoutes');
const auth = require('../../middleware/authMiddleware');
const verifyRoleFromDB = require('../../middleware/verifyRoleFromDB');
const paymentBooking = require('../../controllers/ticketController/paymentBookingController');
const bookingVerification = require('../../src/modules/booking/booking-verification');
const passengerSeatHold = require('../../src/modules/booking/passenger-seat-hold');
const ticketController = require('../../controllers/ticketController/ticketController');
const legacyBookingRetirement = require('../../src/modules/booking/legacy-booking-retirement');

test('Legacy Booking Flow Retirement - Router Characterization', async (t) => {
  const stack = ticketRoutes.stack.filter(layer => layer.route);

  const bookTicketIndex = stack.findIndex(l => l.route.path === '/bookTicket');
  const prepareBookingIndex = stack.findIndex(l => l.route.path === '/prepareBooking');
  const confirmBookingIndex = stack.findIndex(l => l.route.path === '/confirmBooking');
  const verifyBookingIndex = stack.findIndex(l => l.route.path === '/verifyBooking/:ticketId');

  await t.test('1. Exactly one /bookTicket route exists', () => {
    assert.equal(stack.filter(l => l.route.path === '/bookTicket').length, 1);
  });

  const bookTicketRoute = stack[bookTicketIndex];

  await t.test('2. The method is POST', () => {
    assert.ok(bookTicketRoute.route.methods.post);
  });

  await t.test('3. The route appears before /prepareBooking', () => {
    assert.ok(bookTicketIndex < prepareBookingIndex);
  });

  await t.test('4. The route appears before /confirmBooking', () => {
    assert.ok(bookTicketIndex < confirmBookingIndex);
  });

  const handlers = bookTicketRoute.route.stack.map(l => l.handle);

  await t.test('5. The route has exactly four handlers', () => {
    assert.equal(handlers.length, 4);
  });

  await t.test('6. Handler 1 is exactly auth', () => {
    assert.equal(handlers[0], auth);
  });

  await t.test('7. Handler 2 is exactly verifyRoleFromDB', () => {
    assert.equal(handlers[1], verifyRoleFromDB);
  });

  await t.test('8. Handler 3 preserves the passenger role guard behavior', () => {
    const roleGuard = handlers[2];

    // Simulate passenger
    let nextCalled = false;
    roleGuard({ userInfo: { activeRole: 'passenger' } }, {}, () => { nextCalled = true; });
    assert.ok(nextCalled);

    // Simulate non-passenger
    let statusSet = null;
    let jsonSent = null;
    const mockRes = {
      status(code) { statusSet = code; return this; },
      json(data) { jsonSent = data; return this; }
    };
    roleGuard({ userInfo: { activeRole: 'busOwner' } }, mockRes, () => {
      assert.fail('next should not be called');
    });

    assert.equal(statusSet, 403);
    assert.equal(jsonSent.success, false);
  });

  const finalHandler = handlers[3];

  await t.test('9. The final handler returns HTTP 410', () => {
    let statusSet = null;
    const mockRes = {
      status(code) { statusSet = code; return this; },
      json(data) { return this; }
    };
    finalHandler({}, mockRes);
    assert.equal(statusSet, 410);
  });

  await t.test('10. The final handler returns the exact retirement body', () => {
    let jsonSent = null;
    const mockRes = {
      status(code) { return this; },
      json(data) { jsonSent = data; return this; }
    };
    finalHandler({}, mockRes);
    assert.deepEqual(jsonSent, {
      success: false,
      message: "This booking endpoint has been retired. Use the prepare and confirm booking flow.",
      errorCode: "LEGACY_BOOKING_FLOW_RETIRED"
    });
  });

  await t.test('Protect active booking flow - /prepareBooking', () => {
    const route = stack[prepareBookingIndex];
    assert.ok(route.route.methods.post);
    assert.equal(route.route.stack.length, 4);
    assert.equal(route.route.stack[0].handle, auth);
    assert.equal(route.route.stack[1].handle, verifyRoleFromDB);
    // 3rd is the role guard (passenger)
    assert.equal(route.route.stack[3].handle, paymentBooking.prepareBooking);
  });

  await t.test('Protect active booking flow - /confirmBooking', () => {
    const route = stack[confirmBookingIndex];
    assert.ok(route.route.methods.post);
    assert.equal(route.route.stack[0].handle, auth);
    assert.equal(route.route.stack[1].handle, verifyRoleFromDB);
    assert.equal(route.route.stack[3].handle, passengerSeatHold.requireOwnedActivePassengerSeatHold);
    assert.equal(route.route.stack[4].handle, paymentBooking.confirmBooking);
  });

  await t.test('Protect active booking flow - /verifyBooking/:ticketId', () => {
    const route = stack[verifyBookingIndex];
    assert.ok(route.route.methods.get);
    assert.equal(route.route.stack[0].handle, auth);
    assert.equal(route.route.stack[1].handle, verifyRoleFromDB);
    assert.equal(route.route.stack[3].handle, bookingVerification.verifyBooking);
  });

  await t.test('Identity assertions (post-extraction)', () => {
    assert.equal(
      finalHandler,
      legacyBookingRetirement.retireLegacyBookingFlow,
      'Final handler must be exactly legacyBookingRetirement.retireLegacyBookingFlow'
    );

    assert.equal(
      ticketController.bookTicket,
      legacyBookingRetirement.retireLegacyBookingFlow,
      'ticketController.bookTicket must be exactly legacyBookingRetirement.retireLegacyBookingFlow'
    );
  });
});
