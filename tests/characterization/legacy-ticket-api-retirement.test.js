'use strict';
/**
 * tests/characterization/legacy-ticket-api-retirement.test.js
 *
 * Proves that four obsolete ticket API paths are absent from the router,
 * that the controller file and legacy-booking-retirement module have been
 * deleted, and that all active routes keep their exact handler identities.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const path   = require('node:path');
const fs     = require('node:fs');

const router = require('../../routes/ticketRoutes/ticketRoutes');
const auth   = require('../../middleware/authMiddleware');
const verifyRoleFromDB = require('../../middleware/verifyRoleFromDB');
const passengerSeatHold = require('../../src/modules/booking/passenger-seat-hold');
const paymentBooking    = require('../../controllers/ticketController/paymentBookingController');
const bookingVerification = require('../../src/modules/booking/booking-verification');
const tripSeatAvailability = require('../../src/modules/booking/trip-seat-availability');
const passengerBookingHistory = require('../../src/modules/booking/passenger-booking-history');
const passengerBookingCancellation = require('../../src/modules/booking/passenger-booking-cancellation');
const busOwnerScheduleManagement   = require('../../src/modules/bus-owner/schedule-management');

const routed = router.stack.filter(l => l.route);
const find   = (p, m) => routed.find(l => l.route.path === p && l.route.methods[m]);
const handles = r => r.route.stack.map(l => l.handle);

test('Legacy Ticket API Retirement', async (t) => {

  await t.test('retired paths are absent from the router', () => {
    assert.ok(!find('/bookTicket',         'post'), 'POST /bookTicket must be absent');
    assert.ok(!find('/creatSeats',         'post'), 'POST /creatSeats must be absent');
    assert.ok(!find('/getMyYatraHistory',  'get'),  'GET /getMyYatraHistory must be absent');
    assert.ok(!find('/validateYatraPoints','post'), 'POST /validateYatraPoints must be absent');
  });

  await t.test('controller file no longer exists on disk', () => {
    const p = path.resolve(__dirname, '../../controllers/ticketController/ticketController.js');
    assert.ok(!fs.existsSync(p), 'ticketController.js must not exist');
  });

  await t.test('legacy-booking-retirement directory no longer exists on disk', () => {
    const p = path.resolve(__dirname, '../../src/modules/booking/legacy-booking-retirement');
    assert.ok(!fs.existsSync(p), 'legacy-booking-retirement must not exist');
  });

  await t.test('active ticket routes still exist exactly once each', () => {
    const paths = [
      ['/createTicket',        'post'],
      ['/updateTicket',        'patch'],
      ['/deleteTicket',        'delete'],
      ['/getTicketById',       'post'],
      ['/prepareBooking',      'post'],
      ['/confirmBooking',      'post'],
      ['/verifyBooking/:ticketId', 'get'],
      ['/getSeats',            'post'],
      ['/getMyTicketHistory',  'get'],
      ['/cancelTicket',        'post'],
      ['/cancelEstimate',      'post'],
    ];
    for (const [p, m] of paths) {
      const matches = routed.filter(l => l.route.path === p && l.route.methods[m]);
      assert.equal(matches.length, 1, `${m.toUpperCase()} ${p} must appear exactly once`);
    }
  });

  await t.test('schedule management handler identities', () => {
    assert.equal(handles(find('/createTicket',  'post')).at(-1), busOwnerScheduleManagement.createSchedule);
    assert.equal(handles(find('/updateTicket',  'patch')).at(-1), busOwnerScheduleManagement.updateSchedule);
    assert.equal(handles(find('/deleteTicket',  'delete')).at(-1), busOwnerScheduleManagement.deleteSchedule);
    assert.equal(handles(find('/getTicketById', 'post')).at(-1), busOwnerScheduleManagement.getScheduleById);
  });

  await t.test('payment booking handler identities', () => {
    assert.equal(handles(find('/prepareBooking', 'post')).at(-1), paymentBooking.prepareBooking);
    const ch = handles(find('/confirmBooking', 'post'));
    assert.equal(ch.at(-2), passengerSeatHold.requireOwnedActivePassengerSeatHold);
    assert.equal(ch.at(-1), paymentBooking.confirmBooking);
  });

  await t.test('booking verification handler identity', () => {
    assert.equal(handles(find('/verifyBooking/:ticketId', 'get')).at(-1), bookingVerification.verifyBooking);
  });

  await t.test('getSeats handler identity — directly wired to tripSeatAvailability', () => {
    const h = handles(find('/getSeats', 'post'));
    assert.equal(h[0], auth);
    assert.equal(h[1], tripSeatAvailability.getTripSeatAvailability);
  });

  await t.test('getMyTicketHistory handler identity', () => {
    const h = handles(find('/getMyTicketHistory', 'get'));
    assert.equal(h[0], auth);
    assert.equal(h[1], passengerBookingHistory.getPassengerBookingHistory);
  });

  await t.test('cancelTicket and cancelEstimate handler identities', () => {
    assert.equal(handles(find('/cancelTicket',   'post')).at(-1), passengerBookingCancellation.cancelPassengerBooking);
    assert.equal(handles(find('/cancelEstimate', 'post')).at(-1), passengerBookingCancellation.estimatePassengerBookingCancellation);
  });
});
