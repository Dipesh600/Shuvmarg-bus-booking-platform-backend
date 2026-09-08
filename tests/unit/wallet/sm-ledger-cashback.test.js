"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateCashbackAmount,
  selectScratchCardTheme,
} = require("../../../src/modules/wallet/sm-ledger/sm-ledger-cashback.policy");
const {
  createSmLedgerCashbackService,
} = require("../../../src/modules/wallet/sm-ledger/sm-ledger-cashback.service");

function session() {
  return {
    committed: 0, aborted: 0, ended: 0,
    startTransaction() {},
    async withTransaction(work) {
      try { const result = await work(); await this.commitTransaction(); return result; }
      catch (error) { await this.abortTransaction(); throw error; }
    },
    async commitTransaction() { this.committed++; },
    async abortTransaction() { this.aborted++; },
    endSession() { this.ended++; },
  };
}

function rewardModels(originalAmount) {
  return {
    Booking: { findOneAndUpdate: async () => ({ originalAmount }) },
    SMLedger: { find: () => ({ session: async () => [] }) },
    CashbackJob: { updateOne: async () => ({ modifiedCount: 1 }) },
  };
}

test("SM ledger cashback contracts", async (t) => {
  await t.test("cashback policy preserves floor, percentage cap, and maximum", () => {
    assert.equal(calculateCashbackAmount(50, {}, () => 1), 5);
    assert.equal(calculateCashbackAmount(100, {}, () => 1), 15);
    assert.equal(calculateCashbackAmount(1000, {}, () => 1), 30);
    assert.equal(calculateCashbackAmount(1000, {}, () => 0), 5);
  });

  await t.test("theme policy uses active weighted themes and fallback", () => {
    const themes = [
      { name: "off", imageKey: "off.png", isActive: false, weight: 100 },
      { name: "first", imageKey: "1.png", isActive: true, weight: 1 },
      { name: "second", imageKey: "2.png", isActive: true, weight: 3 },
    ];
    assert.deepEqual(selectScratchCardTheme(themes, () => 0), {
      name: "first", imageKey: "1.png",
    });
    assert.deepEqual(selectScratchCardTheme([], () => 0), {
      name: "Default", imageKey: null,
    });
  });

  await t.test("creates cashback credit and scratch card in one transaction", async () => {
    const txn = session();
    let creditInput;
    let scratchInput;
    const service = createSmLedgerCashbackService({
      ...rewardModels(200),
      mongoose: { startSession: async () => txn },
      ScratchCard: { find: () => ({ session: async () => [] }), create: async (rows, options) => ((scratchInput = { rows, options }), [{ _id: "s1" }]) },
      PlatformConfig: {
        getConfig: async (key) => ({
          cashback_config: {},
          sm_money_config: { creditExpiryMonths: 6, scratchCardExpiryDays: 10 },
          scratch_card_themes: [],
        })[key],
      },
      creditLedger: async (input) => ((creditInput = input), { _id: "c1" }),
      calculateCashbackAmount: () => 12,
      selectScratchCardTheme: () => ({ name: "Default", imageKey: null }),
      now: () => new Date("2026-02-01T00:00:00Z"),
    });
    assert.deepEqual(await service({ userId: "u", bookingId: "b", baseTicketPrice: 200 }), {
      ledgerEntry: { _id: "c1" },
      scratchCard: { _id: "s1" },
    });
    assert.equal(creditInput.amount, 12);
    assert.equal(creditInput.expiresInMonths, 6);
    assert.equal(scratchInput.rows[0].expiresAt.toISOString(), "2026-02-11T00:00:00.000Z");
    assert.equal(txn.committed, 1);
    assert.equal(txn.ended, 1);
  });

  await t.test("theme lookup failure is nonfatal and uses default", async () => {
    const txn = session();
    const warnings = [];
    let scratch;
    const service = createSmLedgerCashbackService({
      ...rewardModels(100),
      mongoose: { startSession: async () => txn },
      ScratchCard: { find: () => ({ session: async () => [] }), create: async ([row]) => ((scratch = row), [row]) },
      PlatformConfig: {
        getConfig: async (key) => {
          if (key === "cashback_config") return {};
          if (key === "sm_money_config") return {};
          throw new Error("config unavailable");
        },
      },
      creditLedger: async () => ({ _id: "c1" }),
      calculateCashbackAmount: () => 5,
      selectScratchCardTheme,
      warn: (...args) => warnings.push(args),
    });
    await service({ userId: "u", bookingId: "b", baseTicketPrice: 100 });
    assert.equal(scratch.themeName, "Default");
    assert.equal(scratch.imageUrl, null);
    assert.equal(warnings.length, 1);
  });

  await t.test("cashback write failure aborts and ends transaction", async () => {
    const txn = session();
    const service = createSmLedgerCashbackService({
      ...rewardModels(100),
      mongoose: { startSession: async () => txn },
      ScratchCard: { find: () => ({ session: async () => [] }), create: async () => { throw new Error("scratch failed"); } },
      PlatformConfig: { getConfig: async (key) => (key === "scratch_card_themes" ? [] : {}) },
      creditLedger: async () => ({ _id: "c1" }),
      calculateCashbackAmount: () => 5,
      selectScratchCardTheme,
    });
    await assert.rejects(() => service({ userId: "u", bookingId: "b", baseTicketPrice: 100 }), /scratch failed/);
    assert.equal(txn.aborted, 1);
    assert.equal(txn.ended, 1);
  });
});
