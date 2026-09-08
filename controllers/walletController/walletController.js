const { getOrCreateWallet, getFullBalance } = require("../../services/walletService");
const smLedgerService = require("../../src/modules/wallet/sm-ledger");
const ScratchCard = require("../../models/scratchCardModel");

/**
 * Fetch wallet balance and activity feed.
 *
 * Balance is computed from sm_ledger aggregation (never from stored field).
 * Activity feed reads from sm_ledger with type filter support.
 *
 * Query params:
 *   ?page=1&limit=20
 *   &filter=all|cashback|referral|refunds|spent
 */
const getWalletDetails = async (req, res) => {
  try {
    const userId = req.userInfo.id;
    if (!userId) {
      return res.status(400).json({ status: false, message: "User ID is required" });
    }

    const wallet = await getOrCreateWallet(userId);

    // Pagination
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const typeFilter = req.query.filter || "all";

    // Fetch all balance data from sm_ledger
    const balanceData = await getFullBalance(userId);

    // Fetch activity feed from sm_ledger (replaces WalletTransaction reads)
    const activityFeed = await smLedgerService.getActivityFeed(userId, {
      page,
      limit,
      typeFilter,
    });

    // Count unscratched cards
    const unscratchedCardCount = await ScratchCard.countDocuments({
      userId,
      status: "UNSCRATCHED",
    });

    return res.status(200).json({
      status: true,
      message: "Wallet details retrieved successfully",
      data: {
        // Primary balance (always from ledger aggregation)
        balance: balanceData.spendableBalance,
        lockedBalance: balanceData.lockedBalance,
        isNegative: balanceData.isNegative,

        // Expiry info (for UI banners)
        expiringAmount: balanceData.expiringAmount,
        earliestExpiry: balanceData.earliestExpiry,
        expiringCreditsCount: balanceData.expiringCreditsCount,

        // Scratch cards
        unscratchedCardCount,

        // Wallet status and currency
        currency: wallet.currency,
        walletStatus: wallet.status,

        // Activity feed (from sm_ledger)
        activities: activityFeed.entries,
        pagination: activityFeed.pagination,
      },
    });
  } catch (error) {
    console.error("Error retrieving wallet details:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  getWalletDetails,
};
