'use strict';

/**
 * tests/characterization/legacy-booking-retirement.test.js
 *
 * Characterization test proving retirement of POST /api/ticket/bookTicket (410 Gone).
 */

const {
  createTestSecret,
} = require('../helpers/security-test-values');

process.env.SECRET_KEY ||= createTestSecret('application-hmac');

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../helpers/app');
const db = require('../helpers/db');
const User = require('../../models/userModel');
const ticketController = require('../../controllers/ticketController/ticketController');

test('Legacy Booking Flow Retirement', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('POST /api/ticket/bookTicket returns 410 LEGACY_BOOKING_FLOW_RETIRED and never calls old handler', async () => {
    let legacyFunctionCalled = false;
    const originalFn = ticketController.bookTicket;
    ticketController.bookTicket = (req, res, next) => {
      legacyFunctionCalled = true;
      return originalFn(req, res, next);
    };

    try {
      const user = await User.create({
        phone: '9800000010',
        role: 'passenger',
        roles: ['passenger'],
        status: 'active',
      });

      const token = jwt.sign(
        { id: user._id.toString(), role: 'passenger', activeRole: 'passenger', purpose: 'access' },
        process.env.SECRET_KEY,
        { expiresIn: '1h' }
      );

      const r = await request(app)
        .post('/api/ticket/bookTicket')
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduleId: '507f1f77bcf86cd799439012', seatNumbers: ['a1'] });

      assert.equal(r.status, 410);
      assert.equal(r.body.success, false);
      assert.equal(r.body.errorCode, 'LEGACY_BOOKING_FLOW_RETIRED');
      assert.equal(legacyFunctionCalled, false, 'Legacy bookTicket controller function must not be invoked');
    } finally {
      ticketController.bookTicket = originalFn;
    }
  });
});
