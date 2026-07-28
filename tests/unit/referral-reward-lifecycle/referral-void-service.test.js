"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createReferralVoidService,
} = require(
  "../../../src/modules/referral/reward-lifecycle/referral-void.service"
);

const setup = (referral) => {
  const calls = [];
  const session = {
    startTransaction: () => calls.push("start"),
    commitTransaction: async () => calls.push("commit"),
    abortTransaction: async () => calls.push("abort"),
    endSession: () => calls.push("end"),
  };
  const repository = {
    findReferralById: async () => referral,
    markLockedLedger: async (...args) => calls.push(["mark", ...args]),
  };
  const service = createReferralVoidService({
    mongoose: { startSession: async () => session },
    repository,
    smLedgerService: {
      debitLedgerSimple: async (input) => calls.push(["debit", input]),
    },
  });
  return { service, calls };
};

test("void reverses every unlock and marks the locked reward voided", async () => {
  const referral = {
    _id: "ref1",
    referrerId: "owner",
    status: "PARTIALLY_UNLOCKED",
    lockedLedgerEntryId: "locked1",
    unlockHistory: [
      { amountUnlocked: 30, ledgerEntryId: "u1", journeyNumber: 1 },
      { amountUnlocked: 20, ledgerEntryId: "u2", journeyNumber: 2 },
    ],
    save: async () => {},
  };
  const { service, calls } = setup(referral);
  const result = await service("ref1", "admin1", "fraud");
  assert.deepEqual(result, {
    referralId: "ref1",
    totalDebited: 50,
    unlocksReversed: 2,
  });
  const debits = calls.filter((entry) => entry[0] === "debit");
  assert.equal(debits.length, 2);
  assert.equal(debits[0][1].type, "ADMIN_DEBIT");
  assert.equal(debits[0][1].relatedLedgerEntryId, "u1");
  assert.deepEqual(
    calls.find((entry) => entry[0] === "mark").slice(1, 3),
    ["locked1", "VOIDED"]
  );
  assert.equal(referral.status, "VOIDED");
  assert.equal(referral.voidedBy, "admin1");
  assert.equal(referral.voidReason, "fraud");
  assert.equal(calls.includes("commit"), true);
});

test("void preserves missing and already-voided errors", async () => {
  const missing = setup(null);
  await assert.rejects(missing.service("none", "admin", "reason"), {
    message: "Referral not found.",
  });
  const voided = setup({ status: "VOIDED" });
  await assert.rejects(voided.service("ref", "admin", "reason"), {
    message: "Referral is already voided.",
  });
});

test("void aborts and ends the transaction when a debit fails", async () => {
  const referral = {
    _id: "ref1",
    status: "ACTIVE",
    unlockHistory: [{ amountUnlocked: 30, journeyNumber: 1 }],
  };
  const { service, calls } = setup(referral);
  const originalPush = calls.push.bind(calls);
  calls.push = (...args) => originalPush(...args);
  const failure = new Error("ledger failed");
  const broken = createReferralVoidService({
    mongoose: {
      startSession: async () => ({
        startTransaction: () => {},
        commitTransaction: async () => {},
        abortTransaction: async () => calls.push("abort"),
        endSession: () => calls.push("end"),
      }),
    },
    repository: {
      findReferralById: async () => referral,
      markLockedLedger: async () => {},
    },
    smLedgerService: { debitLedgerSimple: async () => Promise.reject(failure) },
  });
  await assert.rejects(broken("ref1", "admin", "reason"), failure);
  assert.deepEqual(calls.slice(-2), ["abort", "end"]);
});
