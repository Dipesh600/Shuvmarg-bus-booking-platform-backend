'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const fixture = require('../helpers/security-cancellation-fixtures');
const Attempt = require('../../models/esewaPaymentAttemptModel');
const Hold = require('../../models/seatHoldModel');
const { runPaymentRecovery } = require('../../services/paymentRecoveryWorker');
const { createPassengerEsewaCheckoutRecoveryService } = require('../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout-recovery.service');
const { createPassengerEsewaCheckoutRepository } = require('../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.repository');
let data;
before(async () => { await fixture.start(); await Promise.all([Attempt.init(), Hold.init()]); });
after(fixture.stop);
beforeEach(async () => { data = await fixture.seed(); await Attempt.deleteMany({}); await Hold.deleteMany({}); });
test('overlapping workers recover abandoned wallet debits once and preserve active holds', async () => {
  const spent = await fixture.ledgerService.debitLedgerFIFO({ userId: data.userId, amount: 5,
    paymentContext: { gateway: 'wallet', tempBookingId: 'abandoned-hold' } });
  await fixture.Ledger.collection.updateOne({ _id: spent._id }, { $set: {
    createdAt: new Date(0), paymentContext: { gateway: 'wallet', tempBookingId: 'abandoned-hold' } } });
  await Hold.create({ userId: data.userId, tripId: data.tripId, tempBookingId: 'abandoned-hold',
    seatNumbers: ['a1'], status: 'processing', expiresAt: new Date(Date.now() + 60000) });
  await runPaymentRecovery();
  assert.equal(await fixture.Ledger.countDocuments({ type: 'DEBIT_REVERSAL' }), 0);
  await Hold.deleteMany({});
  await Promise.all([runPaymentRecovery(), runPaymentRecovery()]);
  assert.equal(await fixture.Ledger.countDocuments({ type: 'DEBIT_REVERSAL', relatedLedgerEntryId: spent._id }), 1);
});
test('unknown provider state enters finance review without releasing money or closing the attempt', async () => {
  const id = new mongoose.Types.ObjectId();
  await Attempt.collection.insertOne({ _id: id, userId: new mongoose.Types.ObjectId(), transactionUuid: 'unknown-worker',
    tempBookingId: 'unknown-hold', status: 'INITIATED', createdAt: new Date(0), updatedAt: new Date(0) });
  const repository = createPassengerEsewaCheckoutRepository({ EsewaPaymentAttempt: Attempt });
  const recovery = createPassengerEsewaCheckoutRecoveryService({ repository,
    mapper: { response: (statusCode, message, errorCode) => ({ statusCode, body: { message, errorCode } }) },
    closeUnfulfilledAttempt: async () => assert.fail('Unknown payment must not release money'),
  });
  await runPaymentRecovery({ reconcilePaymentAttempt: async input => {
    const attempt = await repository.claimOwnedAttempt(input.transactionUuid, input.userId, 90000);
    if (attempt) await recovery.handleUnverified(attempt, { status: 'NOT_FOUND', identityVerified: false });
  } });
  const saved = await Attempt.findById(id);
  assert.equal(saved.status, 'INITIATED');
  assert.equal(saved.verificationStatus, 'NOT_FOUND');
  assert.ok(saved.reviewRequiredAt);
  assert.equal(saved.result, null);
});
