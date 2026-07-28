"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const policy = require(
  "../../../src/modules/referral/reward-lifecycle/referral-reward.policy"
);
const constants = require(
  "../../../src/modules/referral/reward-lifecycle/referral-reward.constants"
);

test("referral creation policy preserves eligibility rules", async (t) => {
  const now = Date.parse("2026-01-02T00:00:00Z");
  const valid = {
    referrerId: "referrer",
    referredUserId: "friend",
    referrer: { _id: "referrer" },
    referredUser: { createdAt: new Date(now - 23 * 60 * 60 * 1000) },
    now,
  };

  await t.test("accepts a distinct user inside the 24-hour window", () => {
    assert.doesNotThrow(() => policy.validateReferralCreation(valid));
  });
  await t.test("rejects self-referral with exact message", () => {
    assert.throws(
      () =>
        policy.validateReferralCreation({
          ...valid,
          referredUserId: "referrer",
        }),
      { message: "You cannot refer yourself." }
    );
  });
  await t.test("rejects missing users and an existing referral", () => {
    assert.throws(
      () => policy.validateReferralCreation({ ...valid, referrer: null }),
      { message: "Referrer not found." }
    );
    assert.throws(
      () => policy.validateReferralCreation({ ...valid, referredUser: null }),
      { message: "Referred user not found." }
    );
    assert.throws(
      () =>
        policy.validateReferralCreation({
          ...valid,
          referredUser: { ...valid.referredUser, referredBy: "another" },
        }),
      { message: "This user already has a referral code applied." }
    );
  });
  await t.test("rejects after the 24-hour application window", () => {
    assert.throws(
      () =>
        policy.validateReferralCreation({
          ...valid,
          referredUser: {
            createdAt: new Date(now - 25 * 60 * 60 * 1000),
          },
        }),
      {
        message:
          "Referral code can only be applied within 24 hours of signing up.",
      }
    );
  });
});

test("journey unlock policy preserves progressive schedule and guards", () => {
  const referral = {
    journeysCompleted: 0,
    totalUnlocked: 0,
    unlockHistory: [],
  };
  const booking = { userId: "friend", status: "booked", totalAmount: 1 };
  assert.deepEqual(
    policy.validateJourneyUnlock({
      referral,
      booking,
      referredUserId: "friend",
      bookingId: "booking-1",
    }),
    {
      journeyNumber: 1,
      amountUnlocked: 30,
      totalUnlocked: 30,
      lockedRemaining: 70,
      status: "PARTIALLY_UNLOCKED",
    }
  );
  assert.equal(constants.getUnlockAmount(5), 10);
  assert.equal(constants.getUnlockAmount(6), null);
  assert.equal(
    policy.validateJourneyUnlock({
      referral,
      booking: { ...booking, totalAmount: 0 },
      referredUserId: "friend",
      bookingId: "booking-1",
    }),
    null
  );
});
