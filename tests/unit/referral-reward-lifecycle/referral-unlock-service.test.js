"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createReferralUnlockService,
} = require(
  "../../../src/modules/referral/reward-lifecycle/referral-unlock.service"
);
const policy = require(
  "../../../src/modules/referral/reward-lifecycle/referral-reward.policy"
);

const setup = ({ referral, booking } = {}) => {
  const calls = [];
  const session = {
    startTransaction: () => calls.push("start"),
    commitTransaction: async () => calls.push("commit"),
    abortTransaction: async () => calls.push("abort"),
    endSession: () => calls.push("end"),
  };
  const activeReferral = referral || {
    _id: "ref1",
    referrerId: "owner1",
    journeysCompleted: 0,
    totalUnlocked: 0,
    unlockHistory: [],
    lockedLedgerEntryId: "locked1",
  };
  const repository = {
    findActiveReferral: async () => activeReferral,
    findBooking: async () =>
      booking || { userId: "friend1", status: "booked", totalAmount: 20 },
    updateUnlock: async (...args) => calls.push(["update", ...args]),
    markLockedLedger: async (...args) => calls.push(["mark", ...args]),
    findReferrerName: async () => ({ name: "Owner" }),
  };
  const service = createReferralUnlockService({
    mongoose: { startSession: async () => session },
    repository,
    smLedgerService: {
      creditLedger: async (input) => {
        calls.push(["credit", input]);
        return { _id: "unlock1" };
      },
      computeSpendableBalance: async () => ({ display: 30 }),
    },
    policy,
    notificationService: {
      fullyUnlocked: async () => calls.push("full-notify"),
      partiallyUnlocked: async () => calls.push("partial-notify"),
    },
  });
  return { service, calls };
};

test("journey completion creates the exact first progressive unlock", async () => {
  const { service, calls } = setup();
  const result = await service("friend1", "booking1");
  const credit = calls.find((entry) => entry[0] === "credit")[1];
  assert.equal(credit.type, "REFERRAL_UNLOCK");
  assert.equal(credit.amount, 30);
  assert.equal(credit.bookingNumber, 1);
  assert.match(credit.note, /trip #1. NPR 30 unlocked/);
  assert.deepEqual(result, {
    referralId: "ref1",
    journeyNumber: 1,
    amountUnlocked: 30,
    totalUnlocked: 30,
    lockedRemaining: 70,
    status: "PARTIALLY_UNLOCKED",
  });
  assert.equal(calls.includes("commit"), true);
});

test("ineligible booking returns null without starting a transaction", async () => {
  const { service, calls } = setup({
    booking: { userId: "friend1", status: "cancelled", totalAmount: 20 },
  });
  assert.equal(await service("friend1", "booking1"), null);
  assert.deepEqual(calls, []);
});

test("fifth journey marks the locked entry used", async () => {
  const { service, calls } = setup({
    referral: {
      _id: "ref1",
      referrerId: "owner1",
      journeysCompleted: 4,
      totalUnlocked: 90,
      unlockHistory: [],
      lockedLedgerEntryId: "locked1",
    },
  });
  const result = await service("friend1", "booking5");
  assert.equal(result.amountUnlocked, 10);
  assert.equal(result.status, "FULLY_UNLOCKED");
  assert.deepEqual(
    calls.find((entry) => entry[0] === "mark").slice(1, 3),
    ["locked1", "USED"]
  );
});
