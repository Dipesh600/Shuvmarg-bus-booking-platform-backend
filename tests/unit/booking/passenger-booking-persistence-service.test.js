'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPassengerBookingPersistenceService } = require('../../../src/modules/booking/passenger-booking-persistence/passenger-booking-persistence.service.js');

test('passengerBookingPersistenceService unit tests', async (t) => {
  const validMapper = {
    formatPassengerBookingPassengers: () => [],
    mapPassengerBookingPaymentMethod: () => 'ESEWA',
    mapPassengerBookingPersistencePayload: () => ({}),
  };
  const validRepo = { createBooking: async () => ({}) };

  await t.test('1-4. validates repository, mapper, ticket generator, and timestamp factory dependencies', () => {
    assert.throws(() => createPassengerBookingPersistenceService({}), /requires repository/);
    assert.throws(() => createPassengerBookingPersistenceService({ repository: {} }), /requires repository/);
    assert.throws(() => createPassengerBookingPersistenceService({ repository: validRepo, mapper: {} }), /requires valid mapper/);
    assert.throws(() => createPassengerBookingPersistenceService({ repository: validRepo, mapper: validMapper }), /requires generateTicketId/);
    assert.throws(() => createPassengerBookingPersistenceService({ repository: validRepo, mapper: validMapper, generateTicketId: () => 'T1', createTimestamp: 'not-a-fn' }), /requires createTimestamp/);
  });

  await t.test('5-15. service execution flow, lazy timestamp, payload mapping, and return contract', async () => {
    let ticketGenCount = 0;
    let timestampCount = 0;
    let formatArgs = null;
    let paymentMethodArgs = null;
    let payloadArgs = null;
    let repoPayload = null;

    const mockBooking = { _id: 'booking_123', ticketId: 'TKT_99' };

    const service = createPassengerBookingPersistenceService({
      repository: {
        createBooking: async (payload) => {
          repoPayload = payload;
          return mockBooking;
        },
      },
      mapper: {
        formatPassengerBookingPassengers: (args) => {
          formatArgs = args;
          return [{ name: 'Formatted' }];
        },
        mapPassengerBookingPaymentMethod: (args) => {
          paymentMethodArgs = args;
          return 'SM_WALLET_SPLIT';
        },
        mapPassengerBookingPersistencePayload: (args) => {
          payloadArgs = args;
          return { mappedPayload: true, ...args };
        },
      },
      generateTicketId: () => {
        ticketGenCount++;
        return 'TKT_99';
      },
      createTimestamp: () => {
        timestampCount++;
        return 1700000000000;
      },
    });

    const paramsWithPaymentId = {
      userId: 'u1',
      passengerDetails: [{ name: 'Ram' }],
      seatNumbers: ['A1'],
      gateway: 'esewa',
      smMoneyApplied: 100,
      paymentId: 'PAY_123',
    };

    const res1 = await service.persistPassengerBooking(paramsWithPaymentId);

    assert.equal(ticketGenCount, 1);
    assert.equal(timestampCount, 0, 'createTimestamp must NOT be called when paymentId is truthy');
    assert.deepEqual(formatArgs, { passengerDetails: [{ name: 'Ram' }], seatNumbers: ['A1'] });
    assert.deepEqual(paymentMethodArgs, { gateway: 'esewa', smMoneyApplied: 100 });
    assert.equal(payloadArgs.transactionId, 'PAY_123');
    assert.equal(payloadArgs.paymentMethod, 'SM_WALLET_SPLIT');
    assert.equal(payloadArgs.ticketId, 'TKT_99');
    assert.equal(repoPayload.mappedPayload, true);
    assert.equal(res1.booking, mockBooking);
    assert.equal(res1.ticketId, 'TKT_99');

    // Test wallet fallback timestamp lazy call
    const paramsWithoutPaymentId = {
      userId: 'u1',
      gateway: 'wallet',
      paymentId: null,
    };
    await service.persistPassengerBooking(paramsWithoutPaymentId);
    assert.equal(timestampCount, 1, 'createTimestamp called exactly once when paymentId is falsy');
    assert.equal(payloadArgs.transactionId, 'sm_wallet_1700000000000');
  });

  await t.test('16-18. propagates Booking.create, mapper, and ticket generator errors unchanged', async () => {
    const ticketErr = new Error('Ticket gen failed');
    const service1 = createPassengerBookingPersistenceService({
      repository: validRepo,
      mapper: validMapper,
      generateTicketId: () => { throw ticketErr; },
    });
    await assert.rejects(async () => service1.persistPassengerBooking({}), (err) => err === ticketErr);

    const mapperErr = new Error('Mapper failed');
    const service2 = createPassengerBookingPersistenceService({
      repository: validRepo,
      mapper: { ...validMapper, formatPassengerBookingPassengers: () => { throw mapperErr; } },
      generateTicketId: () => 'T1',
    });
    await assert.rejects(async () => service2.persistPassengerBooking({}), (err) => err === mapperErr);

    const dbErr = new Error('DB failed');
    const service3 = createPassengerBookingPersistenceService({
      repository: { createBooking: async () => { throw dbErr; } },
      mapper: validMapper,
      generateTicketId: () => 'T1',
    });
    await assert.rejects(async () => service3.persistPassengerBooking({}), (err) => err === dbErr);
  });

  await t.test('19. missing trip causes payload mapper TypeError, error propagates unchanged, repository is not called', async () => {
    let repoCalled = false;
    const realMapper = require('../../../src/modules/booking/passenger-booking-persistence/passenger-booking-persistence.mapper.js');
    const service = createPassengerBookingPersistenceService({
      repository: {
        createBooking: async () => {
          repoCalled = true;
          return {};
        },
      },
      mapper: realMapper,
      generateTicketId: () => 'T1',
    });

    await assert.rejects(
      async () => service.persistPassengerBooking({ trip: null }),
      (err) => err instanceof TypeError
    );
    assert.equal(repoCalled, false, 'repository.createBooking must not be called when payload mapping throws');
  });
});
