"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createReferralQueryService,
} = require(
  "../../../src/modules/referral/reward-lifecycle/referral-query.service"
);

test("dashboard preserves summary and referral response contracts", async () => {
  const referrals = [
    {
      _id: "r1",
      referredUserId: { name: "Friend", phone: "98", createdAt: "joined" },
      status: "PARTIALLY_UNLOCKED",
      journeysCompleted: 2,
      totalUnlocked: 50,
      lockedRemaining: 50,
      expiresAt: "expiry",
      flaggedForReview: false,
      unlockHistory: [
        { journeyNumber: 1, amountUnlocked: 30, unlockedAt: "unlock" },
      ],
      createdAt: "created",
    },
    {
      _id: "r2",
      referredUserId: null,
      status: "FULLY_UNLOCKED",
      journeysCompleted: 5,
      totalUnlocked: 100,
      lockedRemaining: 0,
      unlockHistory: [],
    },
    {
      _id: "r3",
      referredUserId: {},
      status: "EXPIRED",
      totalUnlocked: 0,
      lockedRemaining: 100,
    },
  ];
  const service = createReferralQueryService({
    repository: {
      findDashboardUser: async () => ({ referralCode: "SHUV-ABC01" }),
      findReferralsForDashboard: async () => referrals,
    },
  });
  const result = await service.getReferralDashboard("owner");
  assert.equal(result.referralCode, "SHUV-ABC01");
  assert.deepEqual(result.summary, {
    totalReferrals: 3,
    activeReferrals: 1,
    fullyUnlocked: 1,
    expiredReferrals: 1,
    totalEarned: 150,
    totalLocked: 50,
  });
  assert.deepEqual(result.referrals[0].referredUser, {
    name: "Friend",
    phone: "98",
    joinedAt: "joined",
  });
  assert.equal(result.referrals[1].referredUser.name, "User");
  assert.deepEqual(result.referrals[0].unlockHistory, [
    { journeyNumber: 1, amountUnlocked: 30, unlockedAt: "unlock" },
  ]);
});

test("dashboard rejects missing users with exact message", async () => {
  const service = createReferralQueryService({
    repository: { findDashboardUser: async () => null },
  });
  await assert.rejects(service.getReferralDashboard("missing"), {
    message: "User not found.",
  });
});

test("status maps progress and returns null when absent", async () => {
  let found = null;
  const service = createReferralQueryService({
    repository: { findReferralStatus: async () => found },
  });
  assert.equal(await service.getReferralStatus("friend"), null);
  found = {
    referrerId: { name: "Owner" },
    status: "ACTIVE",
    journeysCompleted: 0,
    totalUnlocked: 0,
    lockedRemaining: 100,
  };
  assert.deepEqual(await service.getReferralStatus("friend"), {
    referrerName: "Owner",
    status: "ACTIVE",
    journeysCompleted: 0,
    totalUnlocked: 0,
    lockedRemaining: 100,
  });
});
