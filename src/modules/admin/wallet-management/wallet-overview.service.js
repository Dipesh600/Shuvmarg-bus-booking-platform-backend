"use strict";

const Wallet = require("../../../../models/walletModel.js");
const Ledger = require("../../../../models/smLedgerModel.js");

async function getWalletOverview() {
  const walletSummary = await Wallet.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  let totalActiveWallets = 0;
  let totalFrozenWallets = 0;
  for (const group of walletSummary) {
    if (group._id === "active") totalActiveWallets = group.count;
    else if (group._id === "frozen") totalFrozenWallets = group.count;
  }
  const ledgerSummary = await Ledger.aggregate([
    {
      $group: {
        _id: "$direction",
        totalAmount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);
  let totalCreditsIssued = 0;
  let totalDebitsProcessed = 0;
  let totalCreditCount = 0;
  let totalDebitCount = 0;
  for (const group of ledgerSummary) {
    if (group._id === "CREDIT") {
      totalCreditsIssued = group.totalAmount;
      totalCreditCount = group.count;
    } else if (group._id === "DEBIT") {
      totalDebitsProcessed = group.totalAmount;
      totalDebitCount = group.count;
    }
  }
  const outstanding = totalCreditsIssued - totalDebitsProcessed;
  const creditsByType = await Ledger.aggregate([
    { $match: { direction: "CREDIT" } },
    {
      $group: {
        _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]);
  const negativeBalanceCount = await Wallet.countDocuments({
    balance: { $lt: 0 },
  });
  const recentAdjustments = await Ledger.find({
    type: { $in: ["ADMIN_CREDIT", "ADMIN_DEBIT"] },
  })
    .sort({ createdAt: -1 })
    .limit(10)
    .populate({ path: "userId", select: "name phone" })
    .lean();
  const walletCount = totalActiveWallets + totalFrozenWallets;
  return {
    totalActiveWallets,
    totalFrozenWallets,
    totalOutstandingBalance: Math.round(outstanding * 100) / 100,
    totalCreditsIssued,
    totalDebitsProcessed,
    totalCreditCount,
    totalDebitCount,
    creditsByType,
    negativeBalanceCount,
    averageBalance: walletCount > 0 ? Math.round(outstanding / walletCount) : 0,
    recentAdjustments,
  };
}

module.exports = { getWalletOverview };
