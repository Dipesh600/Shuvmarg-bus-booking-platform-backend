"use strict";
const { before, beforeEach, after } = require("node:test");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const SMLedger = require("../../models/smLedgerModel");
const { createSmLedgerEntryService } = require("../../src/modules/wallet/sm-ledger/sm-ledger-entry.service");
const { createSmLedgerFifoDebitService } = require("../../src/modules/wallet/sm-ledger/sm-ledger-fifo-debit.service");
const { createSmLedgerBalanceService } = require("../../src/modules/wallet/sm-ledger/sm-ledger-balance.service");
const { createSmLedgerReversalService } = require("../../src/modules/wallet/sm-ledger/sm-ledger-reversal.service");
const entries = createSmLedgerEntryService({ SMLedger,
  PlatformConfig: { getConfig: async () => ({ creditExpiryMonths: 12 }) } });
const common = { mongoose, SMLedger, toObjectId: id => new mongoose.Types.ObjectId(id) };
const debit = createSmLedgerFifoDebitService(common);
const balance = createSmLedgerBalanceService(common).computeSpendableBalance;
const makeReverse = (creditLedger = entries.creditLedger) =>
  createSmLedgerReversalService({ mongoose, SMLedger, creditLedger });
let replica;
before(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: "8.2.6" }, replSet: { count: 1 } });
  await mongoose.connect(replica.getUri("payment-reversal-tests"));
  await SMLedger.init();
});
beforeEach(async () => { await SMLedger.deleteMany({}); });
after(async () => { await mongoose.disconnect(); if (replica) await replica.stop(); });
async function seed() {
  const userId = new mongoose.Types.ObjectId();
  const credit = await entries.creditLedger({ userId, type: "REFUND", amount: 100 });
  const spent = await debit({ userId, amount: 40 });
  return { userId, credit, spent };
}
const reversals = debitId => SMLedger.find({ type: "DEBIT_REVERSAL", relatedLedgerEntryId: debitId });
module.exports = { mongoose, SMLedger, entries, debit, balance, makeReverse, seed, reversals };
