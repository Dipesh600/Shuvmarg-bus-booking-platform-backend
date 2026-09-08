"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSmLedgerFifoDebitService,
} = require("../../../src/modules/wallet/sm-ledger/sm-ledger-fifo-debit.service");

function session() {
  return {
    started: 0, committed: 0, aborted: 0, ended: 0,
    startTransaction() { this.started++; },
    async withTransaction(work) {
      this.started++;
      try { const result = await work(); this.committed++; return result; }
      catch (error) { this.aborted++; throw error; }
    },
    async commitTransaction() { this.committed++; },
    async abortTransaction() { this.aborted++; },
    endSession() { this.ended++; },
  };
}

test("SM ledger FIFO debit contracts", async (t) => {
  await t.test("consumes oldest credits and cross-links the debit atomically", async () => {
    const txn = session();
    const saved = [];
    const updates = [];
    let balancePipeline, creditFilter;
    const credits = [
      { _id: "c1", remainingAmount: 30, status: "ACTIVE", async save(value) { saved.push([this._id, value]); } },
      { _id: "c2", remainingAmount: 50, status: "ACTIVE", async save(value) { saved.push([this._id, value]); } },
    ];
    let debitPayload;
    const SMLedger = {
      aggregate: (value) => ((balancePipeline = value), { session: async () => [{ total: 80 }] }),
      find: (value) => ((creditFilter = value), {
        sort(value) { assert.deepEqual(value, { expires_at: 1 }); return this; },
        session: async () => credits,
      }),
      create: async ([row], options) => {
        debitPayload = { row, options };
        return [{ _id: "d1", ...row }];
      },
      updateOne: async (...args) => updates.push(args),
    };
    const debit = createSmLedgerFifoDebitService({
      mongoose: { startSession: async () => txn },
      SMLedger,
      toObjectId: (value) => `oid:${value}`,
    });
    const result = await debit({ userId: "u1", amount: 50, bookingId: "b1" });
    assert.equal(result._id, "d1");
    assert.equal(credits[0].remainingAmount, 0);
    assert.equal(credits[0].status, "USED");
    assert.equal(credits[1].remainingAmount, 30);
    assert.deepEqual(debitPayload.row.consumedBy, [
      { debitLedgerEntryId: "c1", amountConsumed: 30 },
      { debitLedgerEntryId: "c2", amountConsumed: 20 },
    ]);
    assert.equal(saved.length, 2);
    assert.equal(updates.length, 2);
    assert.equal(txn.committed, 1);
    assert.equal(txn.aborted, 0);
    assert.equal(txn.ended, 1);
    assert.deepEqual(balancePipeline[0].$match.$or[0], { type: "REFUND", expires_at: null });
    assert.deepEqual(creditFilter.$or[0], { type: "REFUND", expires_at: null });
  });

  await t.test("insufficient balance aborts once without a partial debit", async () => {
    const txn = session();
    const debit = createSmLedgerFifoDebitService({
      mongoose: { startSession: async () => txn },
      SMLedger: { aggregate: () => ({ session: async () => [{ total: 19.6 }] }) },
      toObjectId: (value) => value,
    });
    await assert.rejects(
      () => debit({ userId: "u", amount: 25 }),
      /Available: Rs\. 20, Required: Rs\. 25/
    );
    assert.equal(txn.aborted, 1);
    assert.equal(txn.committed, 0);
    assert.equal(txn.ended, 1);
  });

  await t.test("ticket purchases consume unrestricted refund credit before promotional credit", async () => {
    const txn = session();
    const credits = [
      { _id: "promo", type: "CASHBACK", remainingAmount: 100, status: "ACTIVE", async save() {} },
      { _id: "refund", type: "REFUND", remainingAmount: 40, status: "ACTIVE", async save() {} },
    ];
    let debitPayload;
    const debit = createSmLedgerFifoDebitService({
      mongoose: { startSession: async () => txn },
      SMLedger: {
        aggregate: () => ({ session: async () => [{ total: 140 }] }),
        find: () => ({ sort() { return this; }, session: async () => credits }),
        create: async ([row]) => ((debitPayload = row), [{ _id: "d1", ...row }]),
        updateOne: async () => {},
      },
      toObjectId: (value) => value,
    });
    await debit({ userId: "u1", amount: 50,
      paymentContext: { preferRefundCredit: true } });
    assert.deepEqual(debitPayload.consumedBy, [
      { debitLedgerEntryId: "refund", amountConsumed: 40 },
      { debitLedgerEntryId: "promo", amountConsumed: 10 },
    ]);
  });

  await t.test("write failure aborts once and always ends the session", async () => {
    const txn = session();
    const credit = {
      _id: "c1", remainingAmount: 50, status: "ACTIVE",
      async save() { throw new Error("save failed"); },
    };
    const debit = createSmLedgerFifoDebitService({
      mongoose: { startSession: async () => txn },
      SMLedger: {
        aggregate: () => ({ session: async () => [{ total: 50 }] }),
        find: () => ({ sort() { return this; }, session: async () => [credit] }),
      },
      toObjectId: (value) => value,
    });
    await assert.rejects(() => debit({ userId: "u", amount: 10 }), /save failed/);
    assert.equal(txn.aborted, 1);
    assert.equal(txn.ended, 1);
  });

  await t.test("rejects non-positive debit before opening a session", async () => {
    let opened = false;
    const debit = createSmLedgerFifoDebitService({
      mongoose: { startSession: async () => ((opened = true), session()) },
      SMLedger: {},
      toObjectId: (value) => value,
    });
    await assert.rejects(() => debit({ amount: 0 }), /Debit amount must be greater than zero/);
    assert.equal(opened, false);
  });
});
