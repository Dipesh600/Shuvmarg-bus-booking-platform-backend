'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPassengerBookingPersistenceRepository } = require('../../../src/modules/booking/passenger-booking-persistence/passenger-booking-persistence.repository.js');

test('passengerBookingPersistenceRepository unit tests', async (t) => {
  await t.test('1. rejects missing Booking dependency', () => {
    assert.throws(
      () => createPassengerBookingPersistenceRepository({}),
      /requires Booking model/
    );
  });

  await t.test('2. rejects missing Booking.create', () => {
    assert.throws(
      () => createPassengerBookingPersistenceRepository({ Booking: {} }),
      /requires Booking model/
    );
  });

  await t.test('3 & 4. calls Booking.create with exact payload object reference', async () => {
    let capturedPayload = null;
    const mockBooking = {
      create: async (payload) => {
        capturedPayload = payload;
        return { _id: 'b1', ...payload };
      },
    };
    const repo = createPassengerBookingPersistenceRepository({ Booking: mockBooking });
    const payload = { ticketId: 'TKT1', userId: 'u1' };
    await repo.createBooking(payload);

    assert.equal(capturedPayload, payload);
  });

  await t.test('5 & 6. returns exact Booking.create result (single doc or array)', async () => {
    const docResult = { _id: 'b1' };
    const repo1 = createPassengerBookingPersistenceRepository({
      Booking: { create: async () => docResult },
    });
    const res1 = await repo1.createBooking({});
    assert.equal(res1, docResult);

    const arrayResult = [{ _id: 'b1' }];
    const repo2 = createPassengerBookingPersistenceRepository({
      Booking: { create: async () => arrayResult },
    });
    const res2 = await repo2.createBooking({});
    assert.equal(res2, arrayResult);
  });

  await t.test('7. propagates Booking.create errors unchanged', async () => {
    const createErr = new Error('Database write error');
    const repo = createPassengerBookingPersistenceRepository({
      Booking: {
        create: async () => {
          throw createErr;
        },
      },
    });
    await assert.rejects(
      async () => repo.createBooking({}),
      (err) => err === createErr
    );
  });
});
