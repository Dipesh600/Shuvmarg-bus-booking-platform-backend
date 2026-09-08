"use strict";
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { mongoose, SMLedger } = require("../helpers/payment-reversal-harness");
const Wallet = require("../../models/walletModel");
const walletService = require("../../services/walletService");
const ledger = require("../../src/modules/wallet/sm-ledger");
beforeEach(async () => { await Wallet.deleteMany({}); });

test("frozen wallets receive refund entitlement but cannot spend through either debit entry point", async () => {
  const userId = new mongoose.Types.ObjectId();
  await Wallet.create({ userId, status: "frozen" });
  await walletService.creditWallet({ userId, amount: 100, purpose: "refund" });
  assert.equal(await walletService.getBalance(userId), 100);
  assert.equal((await Wallet.findOne({ userId })).status, "frozen");
  await assert.rejects(() => walletService.debitWallet({ userId, amount: 10 }), /frozen/);
  await assert.rejects(() => ledger.debitLedgerFIFO({ userId, amount: 10 }), /frozen/);
  assert.equal(await SMLedger.countDocuments({ direction: "DEBIT" }), 0);
});

test("failure updating the wallet cache rolls back the credit", async t => {
  const userId = new mongoose.Types.ObjectId();
  await Wallet.create({ userId });
  t.mock.method(Wallet, "findOneAndUpdate", () => { throw new Error("cache write failed"); });
  await assert.rejects(() => walletService.creditWallet({ userId, amount: 40, purpose: "refund" }), /cache write failed/);
  assert.equal(await SMLedger.countDocuments({ userId }), 0);
  assert.equal((await Wallet.findOne({ userId })).balance, 0);
});

test("a ledger outage never falls back to a stale cached balance", async t => {
  const userId = new mongoose.Types.ObjectId();
  await Wallet.create({ userId, balance: 999 });
  t.mock.method(ledger, "computeSpendableBalance", async () => { throw new Error("ledger unavailable"); });
  await assert.rejects(() => walletService.getBalance(userId), /ledger unavailable/);
});

test("concurrent wallet spends never exceed the ledger balance", async () => {
  const userId = new mongoose.Types.ObjectId();
  await walletService.creditWallet({ userId, amount: 100, purpose: "refund" });
  const outcomes = await Promise.allSettled(Array.from({ length: 20 }, () =>
    walletService.debitWallet({ userId, amount: 10, purpose: "ticket_purchase" })));
  assert.equal(outcomes.filter(r => r.status === "fulfilled").length, 10);
  assert.equal(await walletService.getBalance(userId), 0);
  assert.equal((await Wallet.findOne({ userId })).balance, 0);
  assert.equal(await SMLedger.countDocuments({ userId, direction: "DEBIT" }), 10);
});

test("fractional money is conserved and malformed amounts cannot mutate balances", async () => {
  const userId = new mongoose.Types.ObjectId();
  await walletService.creditWallet({ userId, amount: 0.30, purpose: "refund" });
  for (let i = 0; i < 3; i++) await walletService.debitWallet({ userId, amount: 0.10 });
  assert.equal(await walletService.getBalance(userId), 0);
  for (const amount of [Infinity, NaN, "10garbage", 0.001, -1]) {
    await assert.rejects(() => walletService.creditWallet({ userId, amount, purpose: "refund" }));
  }
  assert.equal(await SMLedger.countDocuments({ userId, direction: "CREDIT" }), 1);
});
