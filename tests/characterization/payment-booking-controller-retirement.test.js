'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const router = require('../../routes/ticketRoutes/ticketRoutes');
const existingBookingConfirmation =
  require('../../src/modules/booking/booking-confirmation');
const preparation =
  require('../../src/modules/booking/passenger-booking-preparation');
const orchestrator =
  require('../../src/modules/booking/passenger-booking-confirmation-orchestrator');

const routes = router.stack.filter((layer) => layer.route);
const findRoute = (routePath) =>
  routes.find((layer) => layer.route.path === routePath);
const handlers = (route) => route.route.stack.map((layer) => layer.handle);

test('legacy payment booking controller retirement', async (t) => {
  await t.test('legacy controller file is deleted', () => {
    const controllerPath = path.resolve(
      __dirname,
      '../../controllers/ticketController/paymentBookingController.js'
    );
    assert.equal(fs.existsSync(controllerPath), false);
  });

  await t.test('existing booking-confirmation module keeps its distinct ownership', () => {
    assert.equal(
      typeof existingBookingConfirmation.buildCommittedBookingResponse,
      'function'
    );
    assert.equal(
      typeof existingBookingConfirmation.sendBookingConfirmedNotification,
      'function'
    );
    assert.equal(
      existingBookingConfirmation.confirmPassengerBooking,
      undefined
    );
  });

  await t.test('new orchestrator exports only the confirmation HTTP handler', () => {
    assert.deepEqual(Object.keys(orchestrator), ['confirmPassengerBooking']);
  });

  await t.test('prepare route directly uses the preparation module', () => {
    assert.equal(
      handlers(findRoute('/prepareBooking')).at(-1),
      preparation.preparePassengerBooking
    );
  });

  await t.test('confirm route directly uses the distinct orchestrator', () => {
    assert.equal(
      handlers(findRoute('/confirmBooking')).at(-1),
      orchestrator.confirmPassengerBooking
    );
  });
});
