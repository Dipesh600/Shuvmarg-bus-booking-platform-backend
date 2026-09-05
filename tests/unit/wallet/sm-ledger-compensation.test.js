"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSmLedgerClawbackService,
} = require("../../../src/modules/wallet/sm-ledger/sm-ledger-clawback.service");

const makeSession = () => ({
  committed: 0, aborted: 0, ended: 0,
  startTransaction() {},
  async commitTransaction() { this.committed++; },
  async abortTransaction() { this.aborted++; },
  endSession() { this.ended++; },
});

test("SM ledger clawback contracts", async (t) => {
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

});
