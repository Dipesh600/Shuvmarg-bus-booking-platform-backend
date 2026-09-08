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
          $or: [{ type: "REFUND", expires_at: null }, { expires_at: { $gt: now() } }],
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

  async function computePurchaseBalance(userId) {
    const result = await SMLedger.aggregate([
      {
        $match: {
          userId: toObjectId(userId),
          direction: "CREDIT",
          status: "ACTIVE",
          remainingAmount: { $gt: 0 },
          $or: [{ type: "REFUND", expires_at: null }, { expires_at: { $gt: now() } }],
        },
      },
      {
        $group: {
          _id: { $cond: [{ $eq: ["$type", "REFUND"] }, "refund", "restricted"] },
          total: { $sum: "$remainingAmount" },
        },
      },
    ]);
    const amount = (kind) => Math.max(0, Math.round((result.find((row) => row._id === kind)?.total || 0) * 100) / 100);
    const refund = amount("refund");
    const restricted = amount("restricted");
    return { display: Math.round((refund + restricted) * 100) / 100, refund, restricted };
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

  return { computeSpendableBalance, computePurchaseBalance, computeLockedBalance, getExpiringCredits };
}

module.exports = { createSmLedgerBalanceService };
