"use strict";

function createSmLedgerBalanceService({ SMLedger, toObjectId, now = () => new Date() }) {
  async function computeSpendableBalance(userId) {
    const result = await SMLedger.aggregate([
      {
        $match: {
          userId: toObjectId(userId),
          direction: "CREDIT",
          status: "ACTIVE",
          remainingAmount: { $gt: 0 },
          expires_at: { $gt: now() },
        },
      },
      { $group: { _id: null, total: { $sum: "$remainingAmount" } } },
    ]);
    const spendable = result.length > 0 ? result[0].total : 0;
    const rounded = Math.round(spendable * 100) / 100;
    return {
      display: Math.max(0, rounded),
      raw: rounded,
      isNegative: spendable < 0,
    };
  }

  async function computeLockedBalance(userId) {
    const result = await SMLedger.aggregate([
      {
        $match: {
          userId: toObjectId(userId),
          direction: "CREDIT",
          type: "REFERRAL_LOCKED",
          status: "LOCKED",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    return result.length > 0 ? result[0].total : 0;
  }

  async function getExpiringCredits(userId, withinDays = 30) {
    const currentTime = now();
    const deadline = new Date(
      currentTime.getTime() + withinDays * 24 * 60 * 60 * 1000
    );
    return SMLedger.find({
      userId: toObjectId(userId),
      direction: "CREDIT",
      status: "ACTIVE",
      remainingAmount: { $gt: 0 },
      expires_at: { $gt: currentTime, $lte: deadline },
    })
      .select("amount remainingAmount expires_at type createdAt")
      .sort({ expires_at: 1 })
      .lean();
  }

  return { computeSpendableBalance, computeLockedBalance, getExpiringCredits };
}

module.exports = { createSmLedgerBalanceService };
