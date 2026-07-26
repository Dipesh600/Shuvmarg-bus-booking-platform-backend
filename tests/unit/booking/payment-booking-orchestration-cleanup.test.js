'use strict';

/**
 * Unit tests for extracted payment-booking orchestration cleanup modules.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  createPassengerInternalMoneyCompensationService,
} = require('../../../src/modules/booking/passenger-internal-money-compensation/passenger-internal-money-compensation.service');
const {
  createPassengerPaymentDisputeRepository,
} = require('../../../src/modules/booking/passenger-payment-dispute/passenger-payment-dispute.repository');
const {
  createPassengerBookingPostCommitService,
} = require('../../../src/modules/booking/passenger-booking-post-commit/passenger-booking-post-commit.service');

test('payment booking orchestration cleanup modules', async (t) => {
  await t.test('1. compensation clears split debit after attempt and wallet debit after success', async () => {
    const calls = [];
    const service = createPassengerInternalMoneyCompensationService({
      smLedgerService: { reverseDebit: async (id) => calls.push(['wallet', id]) },
      splitPayment: { reversePassengerSplitPaymentDebit: async ({ debitEntryId }) => calls.push(['split', debitEntryId]) },
      logger: { info: () => {}, error: () => {} },
    });

    const result = await service.reversePassengerInternalMoneyDebits({
      splitPaymentDebitEntryId: 'split-1',
      walletDebitEntryId: 'wallet-1',
      reason: 'failed later',
    });

    assert.deepEqual(calls, [['split', 'split-1'], ['wallet', 'wallet-1']]);
    assert.deepEqual(result, { splitPaymentDebitEntryId: null, walletDebitEntryId: null });
  });

  await t.test('2. dispute repository preserves DISPUTED update shape', async () => {
    let captured = null;
    const repo = createPassengerPaymentDisputeRepository({
      Transaction: { findByIdAndUpdate: async (id, update) => { captured = { id, update }; } },
    });

    await repo.markDisputed({
      transactionId: 'txn-1',
      disputeReason: 'seat failed',
      failureReason: 'Seat lock failed',
    });

    assert.equal(captured.id, 'txn-1');
    assert.deepEqual(captured.update, {
      status: 'DISPUTED',
      disputeReason: 'seat failed',
      failureReason: 'Seat lock failed',
    });
  });

  await t.test('3. post-commit cashback mutates committed response scratchCardId', async () => {
    const response = { success: true, data: { scratchCardId: null } };
    const service = createPassengerBookingPostCommitService({
      passengerSeatHold: { completePassengerHold: async () => {} },
      SMLedger: { updateOne: async () => {} },
      CouponHelper: { applyCoupon: async () => {} },
      smLedgerService: { generateCashback: async () => ({ scratchCard: { _id: 'sc-1' } }) },
      bookingConfirmation: {
        buildCommittedBookingResponse: () => response,
        sendBookingConfirmedNotification: async () => {},
      },
      logger: { warn: () => {}, error: () => {} },
    });

    await service.completePassengerBookingPostCommit({
      booking: { _id: 'booking-1' },
      ticketId: 'T1',
      holdId: 'hold-1',
      userId: 'user-1',
      originalAmount: 1000,
      committedBookingResponse: response,
    });

    assert.equal(response.data.scratchCardId, 'sc-1');
  });

  await t.test('4. controller no longer owns extracted orchestration details', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../../controllers/ticketController/paymentBookingController.js'), 'utf8');
    for (const removed of [
      'createLocalNotification',
      'CouponHelper.applyCoupon',
      'Transaction.findByIdAndUpdate',
      'passengerSeatHold.completePassengerHold',
      'generateCashback',
      'reversePassengerSplitPaymentDebit',
      '_sendDisputeAdminAlert',
    ]) {
      assert.equal(source.includes(removed), false, `removed ${removed}`);
    }
  });
});
