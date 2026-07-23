'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createBookingConfirmationNotifier,
} = require('../../../src/modules/booking/booking-confirmation/booking-confirmation-notification.service');

test('Booking Confirmation Notification Service Contracts', async (t) => {
  await t.test('Case 1: local notification receives exact values and metadata', async () => {
    let localNotifArgs = null;
    const notifier = createBookingConfirmationNotifier({
      createLocalNotification: async (...args) => { localNotifArgs = args; },
      findUserDevices: async () => [],
      sendPushNotification: async () => {},
    });

    const metadata = { scheduleId: 'trip-1', seats: ['a1'] };
    await notifier({ userId: 'user-1', ticketId: 'TKT-123', metadata });

    assert.deepEqual(localNotifArgs, [
      'user-1',
      'BOOKING_CONFIRMED',
      'Ticket Booked Successfully',
      'Your ticket (TKT-123) is confirmed.',
      { scheduleId: 'trip-1', seats: ['a1'] },
    ]);
  });

  await t.test('Case 2: filters out falsy tokens and sends push to valid tokens', async () => {
    let pushArgs = null;
    const notifier = createBookingConfirmationNotifier({
      createLocalNotification: async () => {},
      findUserDevices: async () => [
        { token: 'token-1' },
        { token: null },
        { token: '' },
        { token: 'token-2' },
      ],
      sendPushNotification: async (...args) => { pushArgs = args; },
    });

    await notifier({ userId: 'user-1', ticketId: 'TKT-123', metadata: {} });

    assert.deepEqual(pushArgs, [
      ['token-1', 'token-2'],
      'Ticket Booked Successfully',
      'Your ticket (TKT-123) is confirmed.',
    ]);
  });

  await t.test('Case 3: skips push delivery when no valid tokens exist', async () => {
    let localCalled = false;
    let pushCalled = false;
    const notifier = createBookingConfirmationNotifier({
      createLocalNotification: async () => { localCalled = true; },
      findUserDevices: async () => [{ token: null }, { token: '' }],
      sendPushNotification: async () => { pushCalled = true; },
    });

    await notifier({ userId: 'user-1', ticketId: 'TKT-123', metadata: {} });

    assert.equal(localCalled, true);
    assert.equal(pushCalled, false);
  });

  await t.test('Case 4: propagates local notification errors and halts further steps', async () => {
    let devicesCalled = false;
    let pushCalled = false;

    const notifError = new Error('Database write failed');
    const notifier = createBookingConfirmationNotifier({
      createLocalNotification: async () => { throw notifError; },
      findUserDevices: async () => { devicesCalled = true; return [{ token: 't1' }]; },
      sendPushNotification: async () => { pushCalled = true; },
    });

    await assert.rejects(
      async () => notifier({ userId: 'user-1', ticketId: 'TKT-123', metadata: {} }),
      (err) => err === notifError
    );

    assert.equal(devicesCalled, false);
    assert.equal(pushCalled, false);
  });

  await t.test('Case 5: lookup error propagates and push is not called', async () => {
    let localCalled = false;
    let pushCalled = false;
    const lookupError = new Error('Device lookup failed');
    const notifier = createBookingConfirmationNotifier({
      createLocalNotification: async () => { localCalled = true; },
      findUserDevices: async () => { throw lookupError; },
      sendPushNotification: async () => { pushCalled = true; },
    });

    await assert.rejects(
      async () => notifier({ userId: 'user-1', ticketId: 'TKT-123', metadata: {} }),
      (err) => err === lookupError
    );

    assert.equal(localCalled, true);
    assert.equal(pushCalled, false);
  });

  await t.test('Case 6: null result from findUserDevices propagates and push is not called', async () => {
    let localCalled = false;
    let pushCalled = false;
    const notifier = createBookingConfirmationNotifier({
      createLocalNotification: async () => { localCalled = true; },
      findUserDevices: async () => null,
      sendPushNotification: async () => { pushCalled = true; },
    });

    await assert.rejects(
      async () => notifier({ userId: 'user-1', ticketId: 'TKT-123', metadata: {} })
    );

    assert.equal(localCalled, true);
    assert.equal(pushCalled, false);
  });
});
