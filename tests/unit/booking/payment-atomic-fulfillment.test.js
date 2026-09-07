'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createPassengerBookingConfirmationFulfillmentStage } = require('../../../src/modules/booking/passenger-booking-confirmation-orchestrator/passenger-booking-confirmation-fulfillment-stage.service');
const { createPassengerBookingConfirmationFailureHandler } = require('../../../src/modules/booking/passenger-booking-confirmation-orchestrator/passenger-booking-confirmation-failure.service');

test('atomic production fulfillment bypasses independent seat writes and passes the owned hold', async () => {
  const state = { txnRecord: { _id: 'txn' }, holdId: 'owned-hold', userId: 'user', scheduleId: 'trip', normalizedSeats: ['a1'] };
  const run = createPassengerBookingConfirmationFulfillmentStage({ atomicSeatCommit: true,
    validatePassengerPostPaymentTrip: async () => ({ ok: true, trip: {} }),
    commitPassengerSeats: async () => assert.fail('Independent seat lock must not run'),
    persistPassengerBooking: async input => { assert.equal(input.holdId, 'owned-hold'); return { booking: { _id: 'booking' }, ticketId: 'ticket' }; },
  });
  assert.equal(await run(state), null);
  assert.equal(state.bookingCreated, true);
  assert.equal(state.transactionCommitted, true);
});
test('failed eSewa persistence and stale worker failure do not mutate financial records', async () => {
  const state = { paymentAttemptId: 'attempt', txnRecord: { _id: 'txn' }, holdId: 'hold', normalizedSeats: ['a1'] };
  const run = createPassengerBookingConfirmationFulfillmentStage({ atomicSeatCommit: true,
    validatePassengerPostPaymentTrip: async () => ({ ok: true, trip: {} }),
    persistPassengerBooking: async () => { throw new Error('lease lost'); },
    markPassengerPaymentDisputed: async () => assert.fail('Unfenced dispute'),
    _reverseInternalMoneyDebitIfNeeded: async () => assert.fail('Unfenced reversal'),
  });
  await assert.rejects(() => run(state), /lease lost/);
  const failure = createPassengerBookingConfirmationFailureHandler({ logger: { error() {} },
    _reverseInternalMoneyDebitIfNeeded: async () => assert.fail('Stale worker reversed money'),
  });
  const result = await failure({ error: new Error('lease lost'), res: {}, state });
  assert.equal(result.body.errorCode, 'PAYMENT_RECOVERY_REQUIRED');
});
