'use strict';

/**
 * tests/unit/booking/passenger-wallet-payment-service.test.js
 * Unit tests for passenger wallet payment service.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  createPassengerWalletPaymentService,
} = require('../../../src/modules/booking/passenger-wallet-payment/passenger-wallet-payment.service');
const mapper = require('../../../src/modules/booking/passenger-wallet-payment/passenger-wallet-payment.mapper');

test('passengerWalletPaymentService unit tests', async (t) => {

  await t.test('1 & 2. missing wallet returns WALLET_NOT_AVAILABLE and performs zero ledger debits', async () => {
    let debitCalled = false;
    const walletRepo = { findPassengerWalletByUserId: () => Promise.resolve(null) };
    const smLedgerService = { debitLedgerFIFO: () => { debitCalled = true; return Promise.resolve({}); } };
    const service = createPassengerWalletPaymentService({ walletRepository: walletRepo, smLedgerService, mapper });

    const result = await service.debitPassengerWalletPayment({ userId: 'u1', amount: 500, tempBookingId: 't1' });
    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.errorCode, 'WALLET_NOT_AVAILABLE');
    assert.equal(debitCalled, false);
  });

  await t.test('3 & 4. frozen wallet returns WALLET_FROZEN and performs zero ledger debits', async () => {
    let debitCalled = false;
    const walletRepo = { findPassengerWalletByUserId: () => Promise.resolve({ status: 'frozen' }) };
    const smLedgerService = { debitLedgerFIFO: () => { debitCalled = true; return Promise.resolve({}); } };
    const service = createPassengerWalletPaymentService({ walletRepository: walletRepo, smLedgerService, mapper });

    const result = await service.debitPassengerWalletPayment({ userId: 'u1', amount: 500, tempBookingId: 't1' });
    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 403);
    assert.equal(result.body.errorCode, 'WALLET_FROZEN');
    assert.equal(debitCalled, false);
  });

  await t.test('5, 6, 7, 8, 9, 10, 13. active wallet calls debitLedgerFIFO with exact arguments, logs success, returns debitEntryId', async () => {
    let capturedDebit = null;
    let loggedInfo = null;
    const walletRepo = { findPassengerWalletByUserId: () => Promise.resolve({ status: 'active' }) };
    const smLedgerService = {
      debitLedgerFIFO: (params) => {
        capturedDebit = params;
        return Promise.resolve({ _id: 'debit-entry-99' });
      },
    };
    const mockLogger = { info: (msg, meta) => { loggedInfo = { msg, meta }; } };
    const service = createPassengerWalletPaymentService({ walletRepository: walletRepo, smLedgerService, logger: mockLogger, mapper });

    const result = await service.debitPassengerWalletPayment({ userId: 'u123', amount: 1500, tempBookingId: 'tmp-456' });

    assert.equal(result.ok, true);
    assert.equal(result.debitEntryId, 'debit-entry-99');
    assert.deepEqual(capturedDebit, {
      userId: 'u123',
      amount: 1500,
      bookingId: null,
      operationKey: 'checkout:tmp-456',
      paymentContext: {
        tempBookingId: 'tmp-456', gateway: 'wallet', preferRefundCredit: true,
        refundMoneyApplied: 0, restrictedMoneyApplied: 0,
      },
      note: 'SM Wallet full payment: Rs. 1500 (temp: tmp-456)',
    });
    assert.ok(loggedInfo);
    assert.equal(loggedInfo.msg, 'confirmBooking: SM Wallet debited successfully (full payment)');
    assert.deepEqual(loggedInfo.meta, { userId: 'u123', amount: 1500, debitEntryId: 'debit-entry-99' });
  });

  await t.test('11 & 12. ledger failure logs failure and returns WALLET_DEBIT_FAILED', async () => {
    let loggedWarn = null;
    const walletRepo = { findPassengerWalletByUserId: () => Promise.resolve({ status: 'active' }) };
    const smLedgerService = { debitLedgerFIFO: () => Promise.reject(new Error('Ledger Error')) };
    const mockLogger = { warn: (msg, meta) => { loggedWarn = { msg, meta }; } };
    const service = createPassengerWalletPaymentService({ walletRepository: walletRepo, smLedgerService, logger: mockLogger, mapper });

    const result = await service.debitPassengerWalletPayment({ userId: 'u123', amount: 1000, tempBookingId: 'tmp-1' });

    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 402);
    assert.equal(result.body.errorCode, 'WALLET_DEBIT_FAILED');
    assert.equal(result.body.message, 'Ledger Error');
    assert.ok(loggedWarn);
    assert.equal(loggedWarn.msg, 'confirmBooking: SM Wallet debit failed');
  });

  await t.test('14. repository lookup failure propagates error without swallowing into WALLET_NOT_AVAILABLE', async () => {
    const walletRepo = { findPassengerWalletByUserId: () => Promise.reject(new Error('DB Timeout')) };
    const smLedgerService = { debitLedgerFIFO: () => Promise.resolve({ _id: 'd1' }) };
    const service = createPassengerWalletPaymentService({ walletRepository: walletRepo, smLedgerService, mapper });

    await assert.rejects(
      async () => { await service.debitPassengerWalletPayment({ userId: 'u1', amount: 100, tempBookingId: 't1' }); },
      { message: 'DB Timeout' },
    );
  });

  await t.test('15. debitLedgerFIFO returns null -> ok: false, status 402, WALLET_DEBIT_FAILED, warn logged, info not logged', async () => {
    let loggedWarn = false, loggedInfo = false;
    const walletRepo = { findPassengerWalletByUserId: () => Promise.resolve({ status: 'active' }) };
    const smLedgerService = { debitLedgerFIFO: () => Promise.resolve(null) };
    const mockLogger = { warn: () => { loggedWarn = true; }, info: () => { loggedInfo = true; } };
    const service = createPassengerWalletPaymentService({ walletRepository: walletRepo, smLedgerService, logger: mockLogger, mapper });

    const result = await service.debitPassengerWalletPayment({ userId: 'u1', amount: 100, tempBookingId: 't1' });

    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 402);
    assert.equal(result.body.errorCode, 'WALLET_DEBIT_FAILED');
    assert.equal(loggedWarn, true);
    assert.equal(loggedInfo, false);
  });

  await t.test('16. debitLedgerFIFO returns {} without _id -> ok: false, status 402, WALLET_DEBIT_FAILED', async () => {
    const walletRepo = { findPassengerWalletByUserId: () => Promise.resolve({ status: 'active' }) };
    const smLedgerService = { debitLedgerFIFO: () => Promise.resolve({}) };
    const service = createPassengerWalletPaymentService({ walletRepository: walletRepo, smLedgerService, mapper });

    const result = await service.debitPassengerWalletPayment({ userId: 'u1', amount: 100, tempBookingId: 't1' });

    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 402);
    assert.equal(result.body.errorCode, 'WALLET_DEBIT_FAILED');
    assert.equal(result.debitEntryId, undefined);
  });

  await t.test('17. valid debit entry returns its exact _id', async () => {
    const walletRepo = { findPassengerWalletByUserId: () => Promise.resolve({ status: 'active' }) };
    const smLedgerService = { debitLedgerFIFO: () => Promise.resolve({ _id: 'exact-debit-id-777' }) };
    const service = createPassengerWalletPaymentService({ walletRepository: walletRepo, smLedgerService, mapper });

    const result = await service.debitPassengerWalletPayment({ userId: 'u1', amount: 100, tempBookingId: 't1' });

    assert.equal(result.ok, true);
    assert.equal(result.debitEntryId, 'exact-debit-id-777');
  });
});
