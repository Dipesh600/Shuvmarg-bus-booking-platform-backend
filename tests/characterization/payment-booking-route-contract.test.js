'use strict';
/**
 * tests/characterization/payment-booking-route-contract.test.js
 * Characterizes Express router wiring for prepareBooking and confirmBooking.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const ticketRoutes = require('../../routes/ticketRoutes/ticketRoutes.js');
const auth = require('../../middleware/authMiddleware.js');
const verifyRoleFromDB = require('../../middleware/verifyRoleFromDB.js');
const passengerSeatHold = require('../../src/modules/booking/passenger-seat-hold');
const { preparePassengerBooking } = require('../../src/modules/booking/passenger-booking-preparation');
const { confirmPassengerBooking } = require('../../src/modules/booking/passenger-booking-confirmation-orchestrator');
const {
  requireServerOwnedEsewaCheckout,
} = require('../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.middleware');

test('payment booking Express router contract characterization', async (t) => {
  const routed = ticketRoutes.stack.filter(l => l.route);
  const findRoute = (path, method) => routed.find(l => l.route.path === path && l.route.methods[method]);
  const handles = r => r.route.stack.map(l => l.handle);

  await t.test('1. POST /prepareBooking route contract', () => {
    const matches = routed.filter(l => l.route.path === '/prepareBooking' && l.route.methods.post);
    assert.equal(matches.length, 1, 'POST /prepareBooking must exist exactly once');

    const route = matches[0];
    const stackHandlers = handles(route);
    assert.equal(stackHandlers.length, 4);
    assert.equal(stackHandlers[0], auth);
    assert.equal(stackHandlers[1], verifyRoleFromDB);

    // Test passenger role guard (3rd handler)
    let nextCalled = false;
    stackHandlers[2]({ userInfo: { activeRole: 'passenger' } }, {}, () => { nextCalled = true; });
    assert.equal(nextCalled, true);

    let forbidden = false;
    const res = { status: (code) => { if (code === 403) forbidden = true; return { json: () => {} }; } };
    stackHandlers[2]({ userInfo: { activeRole: 'agent' } }, res, () => {});
    assert.equal(forbidden, true);

    assert.equal(stackHandlers[3], preparePassengerBooking);
  });

  await t.test('2. POST /confirmBooking route contract', () => {
    const matches = routed.filter(l => l.route.path === '/confirmBooking' && l.route.methods.post);
    assert.equal(matches.length, 1, 'POST /confirmBooking must exist exactly once');

    const route = matches[0];
    const stackHandlers = handles(route);
    assert.equal(stackHandlers.length, 6);
    assert.equal(stackHandlers[0], auth);
    assert.equal(stackHandlers[1], verifyRoleFromDB);

    let nextCalled = false;
    stackHandlers[2]({ userInfo: { activeRole: 'passenger' } }, {}, () => { nextCalled = true; });
    assert.equal(nextCalled, true);

    assert.equal(stackHandlers[3], requireServerOwnedEsewaCheckout);
    assert.equal(stackHandlers[4], passengerSeatHold.requireOwnedActivePassengerSeatHold);
    assert.equal(stackHandlers[5], confirmPassengerBooking);
  });

  await t.test('3. POST /releaseBookingHold uses the passenger guard', () => {
    const matches = routed.filter(
      l => l.route.path === '/releaseBookingHold' && l.route.methods.post
    );
    assert.equal(matches.length, 1);
    const stackHandlers = handles(findRoute('/releaseBookingHold', 'post'));
    assert.equal(stackHandlers.length, 4);
    assert.equal(stackHandlers[0], auth);
    assert.equal(stackHandlers[1], verifyRoleFromDB);
    assert.equal(stackHandlers[3], passengerSeatHold.releasePassengerSeatHold);
  });
});
