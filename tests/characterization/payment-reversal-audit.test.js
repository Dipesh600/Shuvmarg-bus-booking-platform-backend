"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { mongoose, SMLedger, entries, makeReverse, seed } = require("../helpers/payment-reversal-harness");
const { auditDebitReversals } = require("../../src/modules/wallet/sm-ledger/sm-ledger-reversal-audit");
const audit = async () => {
  const rows = [];
  for await (const row of auditDebitReversals(SMLedger)) rows.push(row);
  return rows;
};

test("audit accepts a consistent new reversal and never changes ledger documents", async () => {
  const { spent } = await seed();
  await makeReverse()(spent._id);
  const before = await SMLedger.find().sort({ _id: 1 }).lean();
  const rows = await audit();
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].reasons, []);
  assert.deepEqual(await SMLedger.find().sort({ _id: 1 }).lean(), before);
});

test("audit flags duplicate legacy compensation without correcting balances", async () => {
  const { userId, spent } = await seed();
  for (let i = 0; i < 2; i++) await entries.creditLedger({ userId, type: "DEBIT_REVERSAL",
    amount: 40, relatedLedgerEntryId: spent._id });
  const before = await SMLedger.find().sort({ _id: 1 }).lean();
  const rows = await audit();
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.ok(row.reasons.includes("DUPLICATE_COMPENSATION"));
    assert.ok(row.reasons.includes("LEGACY_RESTORATION_REVIEW_REQUIRED"));
  }
  assert.deepEqual(await SMLedger.find().sort({ _id: 1 }).lean(), before);
});

test("audit finds orphaned credits, broken markers and mismatched amounts and users", async () => {
  const { spent } = await seed();
  await SMLedger.updateOne({ _id: spent._id }, { $set: { note: "[REVERSED]" } });
  const orphan = await entries.creditLedger({ userId: new mongoose.Types.ObjectId(),
    type: "DEBIT_REVERSAL", amount: 40, relatedLedgerEntryId: new mongoose.Types.ObjectId() });
  const rows = await audit();
  assert.ok(rows.find(r => r.entryId === String(orphan._id)).reasons.includes("MISSING_OR_INVALID_ORIGINAL_DEBIT"));
  assert.ok(rows.find(r => r.entryId === String(spent._id)).reasons.includes("MARKER_WITHOUT_COMPENSATION"));
  await entries.creditLedger({ userId: new mongoose.Types.ObjectId(), type: "DEBIT_REVERSAL",
    amount: 41, relatedLedgerEntryId: spent._id });
  const mismatch = (await audit()).find(r => r.debitId === String(spent._id));
  assert.ok(mismatch.reasons.includes("AMOUNT_MISMATCH"));
  assert.ok(mismatch.reasons.includes("USER_MISMATCH"));
});
