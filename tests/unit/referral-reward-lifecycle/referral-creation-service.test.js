"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createReferralCreationService,
} = require(
  "../../../src/modules/referral/reward-lifecycle/referral-creation.service"
);
const policy = require(
  "../../../src/modules/referral/reward-lifecycle/referral-reward.policy"
);

const setup = (overrides = {}) => {
  const calls = [];
  const session = {
    startTransaction: () => calls.push("start"),
    commitTransaction: async () => calls.push("commit"),
    abortTransaction: async () => calls.push("abort"),
    endSession: () => calls.push("end"),
  };
  const users = [
    { _id: "r1" },
    {
      _id: "u1",
      name: "Friend",
      createdAt: new Date(Date.now() - 60_000),
    },
  ];
  const repository = {
    findUsers: async () => users,
    findCompletedJourney: async () => null,
    createReferral: async (data) => ({ _id: "ref1", ...data }),
    tagReferredUser: async () => calls.push("tag"),
    ...overrides.repository,
  };
  const smLedgerService = {
    creditLedger: async (input) => {
      calls.push(["credit", input]);
      return { _id: "locked1" };
    },
  };
  const service = createReferralCreationService({
    mongoose: { startSession: async () => session },
    repository,
    smLedgerService,
    policy,
    fraudService: { checkPatterns: async () => calls.push("fraud") },
    notificationService: { friendJoined: async () => calls.push("notify") },
    logger: { error: () => {} },
  });
  return { service, calls };
};

test("creation credits locked reward and commits the referral atomically", async () => {
  const { service, calls } = setup();
  const result = await service({
    referrerId: "r1",
    referredUserId: "u1",
    referralCode: "SHUV-REF01",
  });
  const credit = calls.find((entry) => Array.isArray(entry))[1];
  assert.equal(credit.type, "REFERRAL_LOCKED");
  assert.equal(credit.amount, 100);
  assert.equal(credit.status, "LOCKED");
  assert.match(credit.note, /SHUV-REF01 used by Friend/);
  assert.equal(result.lockedLedgerEntryId, "locked1");
  assert.ok(calls.indexOf("tag") < calls.indexOf("commit"));
  assert.equal(calls.includes("end"), true);
});

test("creation rejects a completed journey before starting a transaction", async () => {
  const { service, calls } = setup({
    repository: {
      findCompletedJourney: async () => ({ tripId: "completed-trip" }),
    },
  });
  await assert.rejects(
    service({
      referrerId: "r1",
      referredUserId: "u1",
      referralCode: "SHUV-REF01",
    }),
    {
      message:
        "Referral code can't be applied after your first trip is completed.",
    }
  );
  assert.deepEqual(calls, []);
});

test("duplicate creation aborts and preserves the exact public error", async () => {
  const duplicate = Object.assign(new Error("duplicate"), { code: 11000 });
  const { service, calls } = setup({
    repository: { createReferral: async () => Promise.reject(duplicate) },
  });
  await assert.rejects(
    service({
      referrerId: "r1",
      referredUserId: "u1",
      referralCode: "SHUV-REF01",
    }),
    { message: "This user already has a referral code applied." }
  );
  assert.equal(calls.includes("abort"), true);
  assert.equal(calls.includes("end"), true);
});
