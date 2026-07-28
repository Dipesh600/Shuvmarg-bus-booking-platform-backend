'use strict';

/**
 * tests/unit/booking/passenger-wallet-payment-repository.test.js
 * Unit tests for passenger wallet payment repository.
 */

const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  createPassengerWalletPaymentRepository,
} = require('../../../src/modules/booking/passenger-wallet-payment/passenger-wallet-payment.repository');

test('passengerWalletPaymentRepository unit tests', async (t) => {

  await t.test('1. findPassengerWalletByUserId calls Wallet.findOne with exact query shape', async () => {
    let capturedQuery = null;
    const mockWallet = {
      findOne: (q) => {
        capturedQuery = q;
        return Promise.resolve({ _id: 'w1', userId: 'u123', status: 'active' });
      },
    };
    const repo = createPassengerWalletPaymentRepository({ Wallet: mockWallet });
    const wallet = await repo.findPassengerWalletByUserId('u123');

    assert.deepEqual(capturedQuery, { userId: 'u123' });
    assert.deepEqual(wallet, { _id: 'w1', userId: 'u123', status: 'active' });
  });

  await t.test('2. returns null unchanged when wallet is not found', async () => {
    const mockWallet = {
      findOne: () => Promise.resolve(null),
    };
    const repo = createPassengerWalletPaymentRepository({ Wallet: mockWallet });
    const result = await repo.findPassengerWalletByUserId('u999');

    assert.equal(result, null);
  });

  await t.test('3. propagates lookup errors', async () => {
    const mockWallet = {
      findOne: () => Promise.reject(new Error('DB Connection Failed')),
    };
    const repo = createPassengerWalletPaymentRepository({ Wallet: mockWallet });

    await assert.rejects(
      async () => { await repo.findPassengerWalletByUserId('u123'); },
      { message: 'DB Connection Failed' },
    );
  });

  await t.test('4. factory throws if Wallet model is missing or invalid', () => {
    assert.throws(
      () => createPassengerWalletPaymentRepository({}),
      { message: 'createPassengerWalletPaymentRepository: Wallet model is required' },
    );
  });
});
