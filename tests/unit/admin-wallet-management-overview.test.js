"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Wallet = require("../../models/walletModel.js");
const Ledger = require("../../models/smLedgerModel.js");
const service = require(
  "../../src/modules/admin/wallet-management/wallet-overview.service.js"
);

function patch(t, object, key, value) {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
}

function ledgerQuery(value) {
  return {
    sort() { return this; },
    limit() { return this; },
    populate() { return this; },
    async lean() { return value; },
  };
}

test("wallet overview preserves platform financial metrics", async (t) => {
  patch(t, Wallet, "aggregate", async () => [
    { _id: "active", count: 3 },
    { _id: "frozen", count: 1 },
  ]);
  let aggregateCall = 0;
  patch(t, Ledger, "aggregate", async () => {
    aggregateCall += 1;
    return aggregateCall === 1
      ? [
        { _id: "CREDIT", totalAmount: 100.25, count: 4 },
        { _id: "DEBIT", totalAmount: 20.1, count: 2 },
      ]
      : [{ _id: "CASHBACK", total: 50, count: 2 }];
  });
  patch(t, Wallet, "countDocuments", async () => 1);
  patch(t, Ledger, "find", () => ledgerQuery([{ _id: "entry" }]));
  assert.deepEqual(await service.getWalletOverview(), {
    totalActiveWallets: 3,
    totalFrozenWallets: 1,
    totalOutstandingBalance: 80.15,
    totalCreditsIssued: 100.25,
    totalDebitsProcessed: 20.1,
    totalCreditCount: 4,
    totalDebitCount: 2,
    creditsByType: [{ _id: "CASHBACK", total: 50, count: 2 }],
    negativeBalanceCount: 1,
    averageBalance: 20,
    recentAdjustments: [{ _id: "entry" }],
  });
});

test("wallet overview preserves zero-wallet average", async (t) => {
  patch(t, Wallet, "aggregate", async () => []);
  patch(t, Ledger, "aggregate", async () => []);
  patch(t, Wallet, "countDocuments", async () => 0);
  patch(t, Ledger, "find", () => ledgerQuery([]));
  assert.equal((await service.getWalletOverview()).averageBalance, 0);
});
