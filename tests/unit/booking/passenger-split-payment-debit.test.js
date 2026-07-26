'use strict';

/**
 * tests/unit/booking/passenger-split-payment-debit.test.js
 * Unit tests for passenger split-payment debit execution.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  createPassengerSplitPaymentService,
} = require('../../../src/modules/booking/passenger-split-payment/passenger-split-payment.service');

test('passengerSplitPaymentDebit unit tests', async (t) => {

  await t.test('1 & 2. passes correct parameters to debitLedgerFIFO and returns success result', async () => {
    let capturedArgs = null;
    const mockSmLedgerService = {
      debitLedgerFIFO: async (args) => {
        capturedArgs = args;
        return { _id: 'debit_abc_123' };
      },
      reverseDebit: async () => {},
    };
    const mockMapper = {
      mapSplitPaymentDebitFailure: () => ({ ok: false, statusCode: 402 }),
    };

    const service = createPassengerSplitPaymentService({
      smLedgerService: mockSmLedgerService,
      logger: null,
      mapper: mockMapper,
    });

    const res = await service.debitPassengerSplitPayment({
      gateway: 'esewa',
      userId: 'user_99',
      amount: 250,
      tempBookingId: 'tmp_456',
    });

    assert.equal(capturedArgs.userId, 'user_99');
    assert.equal(capturedArgs.amount, 250);
    assert.equal(capturedArgs.bookingId, null);
    assert.equal(capturedArgs.note.includes('tmp_456'), true);
    assert.deepEqual(res, { ok: true, applied: true, debitEntryId: 'debit_abc_123' });
  });

  await t.test('3. missing debitEntry throws and triggers failure mapper', async () => {
    const mockSmLedgerService = {
      debitLedgerFIFO: async () => null,
      reverseDebit: async () => {},
    };
    let mappedErr = null;
    const mockMapper = {
      mapSplitPaymentDebitFailure: (err) => {
        mappedErr = err;
        return { ok: false, statusCode: 402, body: { message: err.message } };
      },
    };

    const service = createPassengerSplitPaymentService({
      smLedgerService: mockSmLedgerService,
      logger: null,
      mapper: mockMapper,
    });

    const res = await service.debitPassengerSplitPayment({
      gateway: 'esewa',
      userId: 'user1',
      amount: 100,
      tempBookingId: 'tmp1',
    });

    assert.equal(res.ok, false);
    assert.equal(res.statusCode, 402);
    assert.equal(mappedErr.message, 'Split payment debit did not return a debit entry');
  });

  await t.test('4. FIFO debit exception is caught and mapped by mapper', async () => {
    const mockSmLedgerService = {
      debitLedgerFIFO: async () => {
        throw new Error('Insufficient ledger balance');
      },
      reverseDebit: async () => {},
    };
    const mockMapper = {
      mapSplitPaymentDebitFailure: (err) => ({
        ok: false,
        statusCode: 402,
        body: { success: false, message: err.message, errorCode: 'SM_MONEY_DEBIT_FAILED' },
      }),
    };

    const service = createPassengerSplitPaymentService({
      smLedgerService: mockSmLedgerService,
      logger: null,
      mapper: mockMapper,
    });

    const res = await service.debitPassengerSplitPayment({
      gateway: 'esewa',
      userId: 'user1',
      amount: 100,
      tempBookingId: 'tmp1',
    });

    assert.equal(res.ok, false);
    assert.equal(res.statusCode, 402);
    assert.equal(res.body.message, 'Insufficient ledger balance');
  });

  await t.test('5. logger logs info on success and warn on failure', async () => {
    let loggedInfo = null;
    let loggedWarn = null;
    const mockLogger = {
      info: (msg, meta) => { loggedInfo = { msg, meta }; },
      warn: (msg, meta) => { loggedWarn = { msg, meta }; },
    };

    let shouldFail = false;
    const mockSmLedgerService = {
      debitLedgerFIFO: async () => {
        if (shouldFail) throw new Error('Ledger lock failure');
        return { _id: 'e1' };
      },
      reverseDebit: async () => {},
    };
    const mockMapper = {
      mapSplitPaymentDebitFailure: () => ({ ok: false }),
    };

    const service = createPassengerSplitPaymentService({
      smLedgerService: mockSmLedgerService,
      logger: mockLogger,
      mapper: mockMapper,
    });

    await service.debitPassengerSplitPayment({ gateway: 'esewa', userId: 'u1', amount: 50, tempBookingId: 't1' });
    assert.equal(loggedInfo.msg, 'confirmBooking: SM Money debited (split payment)');

    shouldFail = true;
    await service.debitPassengerSplitPayment({ gateway: 'esewa', userId: 'u1', amount: 50, tempBookingId: 't1' });
    assert.equal(loggedWarn.msg, 'confirmBooking: SM Money FIFO debit failed');
  });
});
