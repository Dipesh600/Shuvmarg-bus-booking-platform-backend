'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const fixture = require('../helpers/security-cancellation-fixtures');
const Settlement = require('../../models/settlementModel');
const Claim = require('../../models/settlementTripClaimModel');
const Receipt = require('../../models/refundSettlementModel');
const { createOwnerSettlement } = require('../../src/shared/create-owner-settlement');
const { reviewOwnerSettlement } = require('../../src/modules/admin/wallet-management/owner-settlement.service');
let input, creator, reviewer;
before(async () => { await fixture.start(); await Promise.all([Settlement.init(), Claim.init(), Receipt.init()]); });
after(fixture.stop);
beforeEach(async () => {
  await Promise.all([Settlement.deleteMany({}), Claim.deleteMany({}), Receipt.deleteMany({})]);
  creator = new mongoose.Types.ObjectId(); reviewer = new mongoose.Types.ObjectId();
  input = { ownerId: new mongoose.Types.ObjectId(), brandId: new mongoose.Types.ObjectId(), tripIds: [new mongoose.Types.ObjectId()],
    totalTicketsSold: 1, grossAmount: 100, platformCommission: 8, netPayableAmount: 92, commissionRate: 8, raisedBy: 'OWNER' };
});
test('concurrent owner requests reserve each trip once, including received historical payouts', async () => {
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => createOwnerSettlement(input)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(await Settlement.countDocuments({}), 1);
  await Claim.deleteMany({}); // Historical settlement with no claim record.
  await Settlement.updateOne({}, { $set: { status: 'received' } });
  await assert.rejects(() => createOwnerSettlement(input), /already/);
});
test('proof, independent review and replay protection precede paid status', async () => {
  const settlement = await createOwnerSettlement(input);
  const base = { settlementId: settlement._id, adminId: creator };
  await assert.rejects(() => reviewOwnerSettlement({ ...base, action: 'confirm-paid' }), /proof/);
  await reviewOwnerSettlement({ ...base, action: 'submit-proof', paymentReference: 'bank-reference', proofKey: 'receipt.webp' });
  assert.equal((await Settlement.findById(settlement._id)).status, 'processing');
  await assert.rejects(() => reviewOwnerSettlement({ ...base, action: 'confirm-paid' }), /different finance/);
  await Promise.all(Array.from({ length: 5 }, () => reviewOwnerSettlement({ ...base, adminId: reviewer, action: 'confirm-paid' })));
  assert.equal((await Settlement.findById(settlement._id)).status, 'paid');
  assert.equal(await Receipt.countDocuments({}), 1);
});
test('failure to save paid status rolls back the receipt and permits a safe retry', async () => {
  const settlement = await createOwnerSettlement(input);
  const base = { settlementId: settlement._id, adminId: creator };
  await reviewOwnerSettlement({ ...base, action: 'submit-proof', paymentReference: 'reference', proofKey: 'receipt.webp' });
  const save = Settlement.prototype.save;
  Settlement.prototype.save = async () => { throw new Error('Injected save failure'); };
  try { await assert.rejects(() => reviewOwnerSettlement({ ...base, action: 'confirm-paid', adminId: reviewer }), /Injected/); }
  finally { Settlement.prototype.save = save; }
  assert.equal(await Receipt.countDocuments({}), 0);
  assert.equal((await Settlement.findById(settlement._id)).status, 'processing');
});
