"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createSmLedgerBalanceService,
} = require("../../../src/modules/wallet/sm-ledger/sm-ledger-balance.service");
const {
  createSmLedgerEntryService,
} = require("../../../src/modules/wallet/sm-ledger/sm-ledger-entry.service");

test("SM ledger balance and entry contracts", async (t) => {
  await t.test("spendable balance preserves query and rounded response", async () => {
    let pipeline;
    const service = createSmLedgerBalanceService({
      SMLedger: { aggregate: async (value) => ((pipeline = value), [{ total: 12.345 }]) },
      toObjectId: (value) => `oid:${value}`,
      now: () => new Date("2026-01-01T00:00:00Z"),
    });
    assert.deepEqual(await service.computeSpendableBalance("u1"), {
      display: 12.35,
      raw: 12.35,
      isNegative: false,
    });
    assert.equal(pipeline[0].$match.userId, "oid:u1");
    assert.equal(pipeline[0].$match.direction, "CREDIT");
    assert.equal(pipeline[0].$match.status, "ACTIVE");
  });

  await t.test("locked and empty balances preserve result shapes", async () => {
    let calls = 0;
    const service = createSmLedgerBalanceService({
      SMLedger: { aggregate: async () => (++calls === 1 ? [{ total: 50 }] : []) },
      toObjectId: (value) => value,
    });
    assert.equal(await service.computeLockedBalance("u1"), 50);
    assert.deepEqual(await service.computeSpendableBalance("u1"), {
      display: 0,
      raw: 0,
      isNegative: false,
    });
  });

  await t.test("expiring credits preserve selection, order, and deadline", async () => {
    const calls = [];
    const query = {
      select(value) { calls.push(["select", value]); return this; },
      sort(value) { calls.push(["sort", value]); return this; },
      lean() { calls.push(["lean"]); return Promise.resolve(["credit"]); },
    };
    const service = createSmLedgerBalanceService({
      SMLedger: { find: (value) => (calls.push(["find", value]), query) },
      toObjectId: (value) => value,
      now: () => new Date("2026-01-01T00:00:00Z"),
    });
    assert.deepEqual(await service.getExpiringCredits("u1", 2), ["credit"]);
    assert.equal(calls[0][1].expires_at.$lte.toISOString(), "2026-01-03T00:00:00.000Z");
    assert.deepEqual(calls[2], ["sort", { expires_at: 1 }]);
  });

  await t.test("credit uses configured expiry and exact active payload", async () => {
    let created;
    const service = createSmLedgerEntryService({
      SMLedger: { create: async (rows, options) => ((created = { rows, options }), [{ _id: "c1" }]) },
      PlatformConfig: { getConfig: async () => ({ creditExpiryMonths: 6 }) },
      now: () => new Date("2026-01-15T00:00:00Z"),
    });
    assert.deepEqual(await service.creditLedger({ userId: "u1", type: "REFUND", amount: 25 }), { _id: "c1" });
    assert.equal(created.rows[0].remainingAmount, 25);
    assert.equal(created.rows[0].direction, "CREDIT");
    assert.equal(created.rows[0].expires_at.toISOString(), "2026-07-15T00:00:00.000Z");
    assert.deepEqual(created.options, {});
  });

  await t.test("locked credit and simple debit preserve lifecycle fields", async () => {
    const rows = [];
    const service = createSmLedgerEntryService({
      SMLedger: { create: async ([row]) => (rows.push(row), [row]) },
      PlatformConfig: { getConfig: async () => ({ creditExpiryMonths: 12 }) },
    });
    const locked = await service.creditLedger({ userId: "u", type: "REFERRAL_LOCKED", amount: 100, status: "LOCKED" });
    const debit = await service.debitLedgerSimple({ userId: "u", type: "ADMIN_DEBIT", amount: 20 });
    assert.equal(locked.expires_at, null);
    assert.equal(locked.remainingAmount, 0);
    assert.equal(debit.direction, "DEBIT");
    assert.equal(debit.status, "PROCESSED");
    assert.equal(debit.remainingAmount, null);
  });

  await t.test("non-positive entries retain exact validation errors", async () => {
    const service = createSmLedgerEntryService({
      SMLedger: {},
      PlatformConfig: {},
    });
    await assert.rejects(() => service.creditLedger({ amount: 0 }), /Credit amount must be greater than zero/);
    await assert.rejects(() => service.debitLedgerSimple({ amount: -1 }), /Debit amount must be greater than zero/);
  });
});
