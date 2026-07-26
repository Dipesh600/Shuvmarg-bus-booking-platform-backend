'use strict';

/**
 * tests/unit/booking/passenger-split-payment-applicability.test.js
 * Unit tests for passenger split-payment applicability checks.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  createPassengerSplitPaymentService,
} = require('../../../src/modules/booking/passenger-split-payment/passenger-split-payment.service');

test('passengerSplitPaymentApplicability unit tests', async (t) => {
  let debitCalled = false;
  const mockSmLedgerService = {
    debitLedgerFIFO: async () => {
      debitCalled = true;
      return { _id: 'entry123' };
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

  t.beforeEach(() => {
    debitCalled = false;
  });

  await t.test('1. gateway === "wallet" returns applied: false without debiting ledger', async () => {
    const res = await service.debitPassengerSplitPayment({
      gateway: 'wallet',
      userId: 'user1',
      amount: 100,
      tempBookingId: 'temp1',
    });
    assert.deepEqual(res, { ok: true, applied: false, debitEntryId: null });
    assert.equal(debitCalled, false);
  });

  await t.test('2. amount === 0 returns applied: false without debiting ledger', async () => {
    const res = await service.debitPassengerSplitPayment({
      gateway: 'esewa',
      userId: 'user1',
      amount: 0,
      tempBookingId: 'temp1',
    });
    assert.deepEqual(res, { ok: true, applied: false, debitEntryId: null });
    assert.equal(debitCalled, false);
  });

  await t.test('3. negative amount returns applied: false without debiting ledger', async () => {
    const res = await service.debitPassengerSplitPayment({
      gateway: 'esewa',
      userId: 'user1',
      amount: -50,
      tempBookingId: 'temp1',
    });
    assert.deepEqual(res, { ok: true, applied: false, debitEntryId: null });
    assert.equal(debitCalled, false);
  });

  await t.test('4. null amount returns applied: false without debiting ledger', async () => {
    const res = await service.debitPassengerSplitPayment({
      gateway: 'esewa',
      userId: 'user1',
      amount: null,
      tempBookingId: 'temp1',
    });
    assert.deepEqual(res, { ok: true, applied: false, debitEntryId: null });
    assert.equal(debitCalled, false);
  });

  await t.test('5. non-wallet gateway with positive amount attempts debit', async () => {
    const res = await service.debitPassengerSplitPayment({
      gateway: 'esewa',
      userId: 'user1',
      amount: 100,
      tempBookingId: 'temp1',
    });
    assert.equal(debitCalled, true);
    assert.deepEqual(res, { ok: true, applied: true, debitEntryId: 'entry123' });
  });
});
