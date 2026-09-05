"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { mongoose, SMLedger, entries, debit, balance, makeReverse, seed, reversals } = require("../helpers/payment-reversal-harness");

test("reversal restores exactly the amount spent without inflating the balance", async () => {
  const { userId, credit, spent } = await seed();
  assert.equal((await balance(userId)).raw, 60);
  const originalCredit = await SMLedger.findById(credit._id).lean();
  const originalDebit = await SMLedger.findById(spent._id).lean();
  const reversal = await makeReverse()(spent._id);
  assert.equal((await balance(userId)).raw, 100);
  assert.equal(reversal.amount, 40);
  assert.deepEqual(await SMLedger.findById(credit._id).lean(), originalCredit);
  assert.equal((await SMLedger.findById(spent._id)).note, originalDebit.note);
  assert.equal(String(reversal.relatedLedgerEntryId), String(spent._id));
});

test("twenty simultaneous reversals commit exactly one compensation", async () => {
  const { userId, spent } = await seed();
  const results = await Promise.all(Array.from({ length: 20 }, () => makeReverse()(spent._id)));
  assert.equal(new Set(results.map(r => String(r._id))).size, 1);
  assert.equal((await reversals(spent._id)).length, 1);
  assert.equal((await balance(userId)).raw, 100);
});

test("replay after spending the compensation cannot replenish it", async () => {
  const { userId, spent } = await seed();
  const first = await makeReverse()(spent._id);
  await debit({ userId, amount: 100 });
  const replay = await makeReverse()(spent._id);
  assert.equal(String(first._id), String(replay._id));
  assert.equal((await balance(userId)).raw, 0);
});

test("failure after credit insertion rolls back both credit and reversal claim", async () => {
  const { userId, spent } = await seed();
  const reverse = makeReverse(async input => {
    await entries.creditLedger(input);
    throw new Error("injected failure after credit");
  });
  await assert.rejects(() => reverse(spent._id), /injected failure/);
  assert.equal((await reversals(spent._id)).length, 0);
  assert.equal((await balance(userId)).raw, 60);
  assert.equal((await SMLedger.findById(spent._id)).reversalEntryId, null);
  await makeReverse()(spent._id);
  assert.equal((await balance(userId)).raw, 100);
});

test("an existing legacy reversal is returned without another credit or historical correction", async () => {
  const { userId, spent } = await seed();
  const old = await entries.creditLedger({ userId, type: "DEBIT_REVERSAL", amount: 40,
    relatedLedgerEntryId: spent._id });
  const result = await makeReverse()(spent._id);
  assert.equal(String(result._id), String(old._id));
  assert.equal((await balance(userId)).raw, 100);
  assert.equal((await reversals(spent._id)).length, 1);
});

test("duplicate legacy reversals fail closed for reconciliation", async () => {
  const { userId, spent } = await seed();
  for (let i = 0; i < 2; i++) await entries.creditLedger({ userId, type: "DEBIT_REVERSAL",
    amount: 40, relatedLedgerEntryId: spent._id });
  await assert.rejects(() => makeReverse()(spent._id), /reconciliation/i);
  assert.equal((await balance(userId)).raw, 140);
  assert.equal((await reversals(spent._id)).length, 2);
});

test("legacy reversed marker without a credit requires reconciliation", async () => {
  const { userId, spent } = await seed();
  await SMLedger.updateOne({ _id: spent._id }, { $set: { note: "spent [REVERSED]" } });
  await assert.rejects(() => makeReverse()(spent._id), /reconciliation/i);
  assert.equal((await balance(userId)).raw, 60);
});

test("a compensation with the wrong amount is never accepted", async () => {
  const { userId, spent } = await seed();
  await entries.creditLedger({ userId, type: "DEBIT_REVERSAL", amount: 41, relatedLedgerEntryId: spent._id });
  await assert.rejects(() => makeReverse()(spent._id), /reconciliation/i);
  assert.equal((await reversals(spent._id)).length, 1);
});

test("a compensation belonging to another user is never accepted", async () => {
  const { userId, spent } = await seed();
  await entries.creditLedger({ userId: new mongoose.Types.ObjectId(), type: "DEBIT_REVERSAL",
    amount: 40, relatedLedgerEntryId: spent._id });
  await assert.rejects(() => makeReverse()(spent._id), /reconciliation/i);
  assert.equal((await balance(userId)).raw, 60);
  assert.equal((await reversals(spent._id)).length, 1);
});

test("missing entries, credits and non-booking debits cannot be reversed", async () => {
  const { userId, credit } = await seed();
  await assert.rejects(() => makeReverse()(new mongoose.Types.ObjectId()), /not found/);
  await assert.rejects(() => makeReverse()(credit._id), /Only booking DEBIT/);
  const clawback = await entries.debitLedgerSimple({ userId, type: "CASHBACK_CLAWBACK", amount: 10 });
  await assert.rejects(() => makeReverse()(clawback._id), /Only booking DEBIT/);
  assert.equal(await SMLedger.countDocuments({ type: "DEBIT_REVERSAL" }), 0);
});

test("sequential retries reuse the same committed reversal", async () => {
  const { userId, spent } = await seed();
  const first = await makeReverse()(spent._id);
  for (let i = 0; i < 3; i++) assert.equal(String((await makeReverse()(spent._id))._id), String(first._id));
  assert.equal((await reversals(spent._id)).length, 1);
  assert.equal((await balance(userId)).raw, 100);
});
