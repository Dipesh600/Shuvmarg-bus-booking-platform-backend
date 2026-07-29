"use strict";

const Ledger = require("../../../../models/smLedgerModel.js");

function ledgerFilter(type) {
  const filters = {
    cashback: { $in: ["CASHBACK", "CASHBACK_CLAWBACK"] },
    referral: { $in: ["REFERRAL_LOCKED", "REFERRAL_UNLOCK"] },
    spent: { $in: ["DEBIT", "DEBIT_REVERSAL"] },
    admin: { $in: ["ADMIN_CREDIT", "ADMIN_DEBIT"] },
    refunds: "REFUND",
  };
  return filters[type] ? { type: filters[type] } : {};
}

async function getGlobalLedgerFeed({ type = "all", page = 1, limit = 25 }) {
  const pageNumber = Math.max(1, parseInt(page) || 1);
  const limitNumber = Math.min(100, Math.max(1, parseInt(limit) || 25));
  const skip = (pageNumber - 1) * limitNumber;
  const match = ledgerFilter(type);
  const [entries, totalCount] = await Promise.all([
    Ledger.find(match)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .populate({ path: "userId", select: "name phone" })
      .populate({ path: "bookingId", select: "ticketId" })
      .lean(),
    Ledger.countDocuments(match),
  ]);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const summary = await Ledger.aggregate([
    { $match: { createdAt: { $gte: todayStart } } },
    {
      $group: {
        _id: "$direction",
        totalAmount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);
  const stats = {
    totalCreditsToday: 0,
    totalDebitsToday: 0,
    totalCreditAmountToday: 0,
    totalDebitAmountToday: 0,
  };
  for (const group of summary) {
    if (group._id === "CREDIT") {
      stats.totalCreditsToday = group.count;
      stats.totalCreditAmountToday =
        Math.round(group.totalAmount * 100) / 100;
    } else if (group._id === "DEBIT") {
      stats.totalDebitsToday = group.count;
      stats.totalDebitAmountToday =
        Math.round(group.totalAmount * 100) / 100;
    }
  }
  return {
    entries,
    stats,
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      totalCount,
      totalPages: Math.ceil(totalCount / limitNumber),
      hasMore: skip + entries.length < totalCount,
    },
  };
}

module.exports = { getGlobalLedgerFeed, ledgerFilter };
