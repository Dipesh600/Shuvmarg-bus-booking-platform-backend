'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('passengerBookingPersistence ownership static tests', async (t) => {
  const controllerPath = path.resolve(
    __dirname,
    '../../../controllers/ticketController/paymentBookingController.js'
  );
  const controllerContent = fs.readFileSync(controllerPath, 'utf8');

  const moduleFiles = [
    'index.js',
    'passenger-booking-persistence.repository.js',
    'passenger-booking-persistence.mapper.js',
    'passenger-booking-persistence.service.js',
  ].map((file) =>
    fs.readFileSync(
      path.resolve(
        __dirname,
        '../../../src/modules/booking/passenger-booking-persistence',
        file
      ),
      'utf8'
    )
  );
  const moduleCombinedContent = moduleFiles.join('\n');

  await t.test('1. controller confirmBooking does NOT contain inline booking persistence logic/strings', () => {
    const confirmBookingSource = controllerContent.slice(
      controllerContent.indexOf('const confirmBooking')
    );
    const forbiddenInConfirmBooking = [
      'Booking.create({',
      'const formattedPassengers =',
      'let paymentMethodLabel',
      'paymentMethodLabel = "SM_WALLET"',
      'paymentMethodLabel = "SM_WALLET_SPLIT"',
      'paymentMethodLabel = gateway.toUpperCase()',
      'transactionId: paymentId || `sm_wallet_',
      'bookedVia: "APP"',
    ];
    for (const str of forbiddenInConfirmBooking) {
      assert.equal(
        confirmBookingSource.includes(str),
        false,
        `confirmBooking must not contain '${str}'`
      );
    }
  });

  await t.test('2. controller contains required orchestration symbols, module invocation, and side effects', () => {
    const requiredInController = [
      'persistPassengerBooking',
      'bookingPersistenceResult',
      'bookingPersistenceResult.booking',
      'bookingPersistenceResult.ticketId',
      'bookingCreated = true',
      'Booking.create() failed:',
      'markPassengerPaymentDisputed',
      'rollbackPassengerSeatLocks',
      '_reverseInternalMoneyDebitIfNeeded',
      'sendPassengerPaymentDisputeAdminAlert',
      'notifyPassengerPaymentDispute',
    ];
    for (const str of requiredInController) {
      assert.ok(
        controllerContent.includes(str),
        `controller retains '${str}'`
      );
    }
  });

  await t.test('3. new module owns persistence domain details and strings', () => {
    const requiredInModule = [
      'Booking.create',
      'formatPassengerBookingPassengers',
      'mapPassengerBookingPaymentMethod',
      'mapPassengerBookingPersistencePayload',
      'generateBookingTicketId',
      'SM_WALLET',
      'SM_WALLET_SPLIT',
      'sm_wallet_',
      'bookedVia',
      'APP',
    ];
    for (const str of requiredInModule) {
      assert.ok(
        moduleCombinedContent.includes(str),
        `module owns '${str}'`
      );
    }
  });

  await t.test('4. new module does NOT contain controller side effects or HTTP handling', () => {
    const forbiddenInModule = [
      'Transaction.findByIdAndUpdate',
      '_rollbackSeatLocks',
      '_reverseInternalMoneyDebitIfNeeded',
      '_sendDisputeAdminAlert',
      'createLocalNotification',
      'res.status',
      'req.body',
      'DISPUTED',
      'SUCCESS',
      'BOOKING_RECONCILIATION_REQUIRED',
    ];
    for (const str of forbiddenInModule) {
      assert.equal(
        moduleCombinedContent.includes(str),
        false,
        `module must not contain '${str}'`
      );
    }
  });
});
