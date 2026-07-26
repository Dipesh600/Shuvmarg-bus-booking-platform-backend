'use strict';

/**
 * tests/unit/booking/passenger-split-payment-reversal.test.js
 * Unit tests for passenger split-payment reversal lifecycle.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  createPassengerSplitPaymentService,
} = require('../../../src/modules/booking/passenger-split-payment/passenger-split-payment.service');

test('passengerSplitPaymentReversal unit tests', async (t) => {

  await t.test('1. null or missing debitEntryId skips reversal', async () => {
    let reverseCalled = false;
    const mockSmLedgerService = {
      debitLedgerFIFO: async () => {},
      reverseDebit: async () => { reverseCalled = true; },
    };

    const service = createPassengerSplitPaymentService({
      smLedgerService: mockSmLedgerService,
      logger: null,
      mapper: { mapSplitPaymentDebitFailure: () => {} },
    });

    const res1 = await service.reversePassengerSplitPaymentDebit({ debitEntryId: null, reason: 'test' });
    const res2 = await service.reversePassengerSplitPaymentDebit({ debitEntryId: undefined, reason: 'test' });

    assert.deepEqual(res1, { reversed: false, skipped: true });
    assert.deepEqual(res2, { reversed: false, skipped: true });
    assert.equal(reverseCalled, false);
  });

  await t.test('2 & 4. calls reverseDebit and logs success info', async () => {
    let reversedId = null;
    let loggedInfo = null;
    const mockSmLedgerService = {
      debitLedgerFIFO: async () => {},
      reverseDebit: async (id) => { reversedId = id; },
    };
    const mockLogger = {
      info: (msg, meta) => { loggedInfo = { msg, meta }; },
      error: () => {},
    };

    const service = createPassengerSplitPaymentService({
      smLedgerService: mockSmLedgerService,
      logger: mockLogger,
      mapper: { mapSplitPaymentDebitFailure: () => {} },
    });

    const res = await service.reversePassengerSplitPaymentDebit({
      debitEntryId: 'entry_777',
      reason: 'eSewa failed',
    });

    assert.equal(reversedId, 'entry_777');
    assert.deepEqual(res, { reversed: true, skipped: false });
    assert.equal(loggedInfo.msg, 'confirmBooking: SM Money debit reversed');
    assert.equal(loggedInfo.meta.reason, 'eSewa failed');
  });

  await t.test('3 & 5. catches reversal error, logs error level critical message, and does not throw', async () => {
    let loggedError = null;
    const mockSmLedgerService = {
      debitLedgerFIFO: async () => {},
      reverseDebit: async () => {
        throw new Error('Database connection lost during reversal');
      },
    };
    const mockLogger = {
      info: () => {},
      error: (msg, meta) => { loggedError = { msg, meta }; },
    };

    const service = createPassengerSplitPaymentService({
      smLedgerService: mockSmLedgerService,
      logger: mockLogger,
      mapper: { mapSplitPaymentDebitFailure: () => {} },
    });

    const res = await service.reversePassengerSplitPaymentDebit({
      debitEntryId: 'entry_888',
      reason: 'Seat lock failed',
    });

    assert.equal(res.reversed, false);
    assert.equal(res.skipped, false);
    assert.equal(res.error.message, 'Database connection lost during reversal');
    assert.equal(loggedError.msg, 'confirmBooking: CRITICAL — failed to reverse SM Money debit');
    assert.equal(loggedError.meta.debitEntryId, 'entry_888');
  });
});
