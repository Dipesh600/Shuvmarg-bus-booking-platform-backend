"use strict";

const TYPE_FILTERS = {
  cashback: { $in: ["CASHBACK", "CASHBACK_CLAWBACK"] },
  referral: { $in: ["REFERRAL_LOCKED", "REFERRAL_UNLOCK"] },
  refunds: "REFUND",
  spent: { $in: ["DEBIT", "DEBIT_REVERSAL"] },
};

function createSmLedgerActivityService({ SMLedger, toObjectId }) {
  return async function getActivityFeed(
    userId,
    { page = 1, limit = 20, typeFilter = "all" } = {}
  ) {
    const match = { userId: toObjectId(userId) };
    if (TYPE_FILTERS[typeFilter]) match.type = TYPE_FILTERS[typeFilter];
    const skip = (page - 1) * limit;
    const [entries, totalCount] = await Promise.all([
      SMLedger.find(match)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("bookingId", "ticketId seats")
        .lean(),
      SMLedger.countDocuments(match),
    ]);
    return {
      entries,
      totalCount,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: skip + entries.length < totalCount,
      },
    };
  };
}

module.exports = { createSmLedgerActivityService, TYPE_FILTERS };
