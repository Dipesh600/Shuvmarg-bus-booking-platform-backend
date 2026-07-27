"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSmLedgerClawbackService,
} = require("../../../src/modules/wallet/sm-ledger/sm-ledger-clawback.service");
const {
  createSmLedgerReversalService,
} = require("../../../src/modules/wallet/sm-ledger/sm-ledger-reversal.service");

const makeSession = () => ({
  committed: 0, aborted: 0, ended: 0,
  startTransaction() {},
  async commitTransaction() { this.committed++; },
  async abortTransaction() { this.aborted++; },
  endSession() { this.ended++; },
});

test("SM ledger compensation contracts", async (t) => {
  await t.test("clawback debits each cashback and closes scratch cards", async () => {
    const txn = makeSession();
    const debits = [];
    let scratchUpdate;
    const credits = [
      { _id: "c1", userId: "u", amount: 10, status: "ACTIVE", remainingAmount: 5, async save() {} },
      { _id: "c2", userId: "u", amount: 20, status: "USED", remainingAmount: 0, async save() {} },
    ];
    const clawback = createSmLedgerClawbackService({
      mongoose: { startSession: async () => txn },
      SMLedger: { find: () => ({ session: async () => credits }) },
      ScratchCard: { updateMany: async (...args) => (scratchUpdate = args) },
      debitLedgerSimple: async (input) => debits.push(input),
    });
    assert.deepEqual(await clawback("b1"), { clawedBack: 30, entriesCreated: 2 });
    assert.equal(debits[0].type, "CASHBACK_CLAWBACK");
    assert.equal(debits[0].relatedLedgerEntryId, "c1");
    assert.equal(credits[0].status, "CLAWED_BACK");
    assert.equal(credits[0].remainingAmount, 0);
    assert.deepEqual(scratchUpdate[1], { $set: { status: "CLAWED_BACK" } });
    assert.equal(txn.committed, 1);
  });

  await t.test("clawback failure aborts and ends its session", async () => {
    const txn = makeSession();
    const clawback = createSmLedgerClawbackService({
      mongoose: { startSession: async () => txn },
      SMLedger: { find: () => ({ session: async () => { throw new Error("read failed"); } }) },
      ScratchCard: {},
      debitLedgerSimple: async () => {},
    });
    await assert.rejects(() => clawback("b"), /read failed/);
    assert.equal(txn.aborted, 1);
    assert.equal(txn.ended, 1);
  });

  await t.test("reversal validates the original debit before a transaction", async () => {
    let opened = false;
    const reverse = createSmLedgerReversalService({
      mongoose: { startSession: async () => ((opened = true), makeSession()) },
      SMLedger: { findById: async () => null },
      creditLedger: async () => {},
    });
    await assert.rejects(() => reverse("missing"), /Debit entry not found/);
    assert.equal(opened, false);
  });

  await t.test("reversal restores eligible credits and creates compensating credit", async () => {
    const txn = makeSession();
    const updates = [];
    let creditInput;
    const debit = {
      _id: "d1", userId: "u", bookingId: "b", direction: "DEBIT",
      type: "DEBIT", amount: 40, note: "spent",
      consumedBy: [{ debitLedgerEntryId: "c1", amountConsumed: 40 }],
    };
    let lookup = 0;
    const SMLedger = {
      findById: () => {
        lookup++;
        if (lookup === 1) return Promise.resolve(debit);
        return { session: async () => ({ _id: "c1", status: "USED", remainingAmount: 0, amount: 50 }) };
      },
      updateOne: async (...args) => updates.push(args),
    };
    const reverse = createSmLedgerReversalService({
      mongoose: { startSession: async () => txn },
      SMLedger,
      creditLedger: async (input) => ((creditInput = input), { _id: "r1" }),
    });
    assert.deepEqual(await reverse("d1"), { _id: "r1" });
    assert.deepEqual(updates[0][1].$set, { remainingAmount: 40, status: "ACTIVE" });
    assert.deepEqual(updates[0][1].$pull, { consumedBy: { debitLedgerEntryId: "d1" } });
    assert.equal(updates[1][1].$set.note, "spent [REVERSED]");
    assert.equal(creditInput.type, "DEBIT_REVERSAL");
    assert.equal(creditInput.relatedLedgerEntryId, "d1");
    assert.equal(txn.committed, 1);
  });

  await t.test("reversal skips ineligible credits but still records reversal", async () => {
    const txn = makeSession();
    const updates = [];
    let lookup = 0;
    const debit = {
      _id: "d", userId: "u", direction: "DEBIT", type: "DEBIT", amount: 5,
      consumedBy: [{ debitLedgerEntryId: "expired", amountConsumed: 5 }],
    };
    const reverse = createSmLedgerReversalService({
      mongoose: { startSession: async () => txn },
      SMLedger: {
        findById: () => ++lookup === 1
          ? Promise.resolve(debit)
          : { session: async () => ({ status: "EXPIRED" }) },
        updateOne: async (...args) => updates.push(args),
      },
      creditLedger: async () => ({ _id: "r" }),
    });
    await reverse("d");
    assert.equal(updates.length, 1);
    assert.equal(updates[0][0]._id, "d");
  });
});
