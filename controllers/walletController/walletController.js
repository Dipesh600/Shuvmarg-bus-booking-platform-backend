const { getOrCreateWallet, getFullBalance } = require("../../services/walletService");
const smLedgerService = require("../../services/smLedgerService");
const ScratchCard = require("../../models/scratchCardModel");
const Wallet = require("../../models/walletModel");
const bcrypt = require("bcryptjs");

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

        // Wallet meta (PIN, status, currency)
        currency: wallet.currency,
        walletStatus: wallet.status,
        isPinSet: wallet.isPinSet || false,

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

/**
 * Setup wallet PIN — hashes the 4-digit PIN and stores it.
 * Called once when the user enables their wallet.
 */
const setupWalletPin = async (req, res) => {
  try {
    const userId = req.userInfo.id;
    const { pin } = req.body;

    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({
        status: false,
        message: "PIN must be exactly 4 digits",
      });
    }

    const wallet = await getOrCreateWallet(userId);

    if (wallet.isPinSet) {
      return res.status(400).json({
        status: false,
        message: "Wallet PIN is already set. Use change-pin to update it.",
      });
    }

    // Hash the PIN with bcrypt (10 salt rounds)
    const hashedPin = await bcrypt.hash(pin, 10);

    wallet.pin = hashedPin;
    wallet.isPinSet = true;
    await wallet.save();

    return res.status(200).json({
      status: true,
      message: "Wallet PIN set successfully",
    });
  } catch (error) {
    console.error("Error setting wallet PIN:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

/**
 * Verify wallet PIN — compares the provided PIN against the stored hash.
 * Called before every wallet payment transaction.
 */
const verifyWalletPin = async (req, res) => {
  try {
    const userId = req.userInfo.id;
    const { pin } = req.body;

    if (!pin || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({
        status: false,
        message: "PIN must be exactly 4 digits",
      });
    }

    const wallet = await Wallet.findOne({ userId });

    if (!wallet || !wallet.isPinSet) {
      return res.status(400).json({
        status: false,
        message: "Wallet PIN is not set. Please set up your wallet first.",
      });
    }

    if (wallet.status !== "active") {
      return res.status(403).json({
        status: false,
        message: "Wallet is frozen. Please contact support.",
      });
    }

    const isMatch = await bcrypt.compare(pin, wallet.pin);

    if (!isMatch) {
      return res.status(401).json({
        status: false,
        message: "Incorrect PIN. Please try again.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "PIN verified successfully",
    });
  } catch (error) {
    console.error("Error verifying wallet PIN:", error);
    return res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  getWalletDetails,
  setupWalletPin,
  verifyWalletPin,
};
