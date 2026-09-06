const mongoose = require("mongoose");
const { withMongoTransaction } = require("../src/shared/with-mongo-transaction");
const { toMinorUnits, fromMinorUnits } = require("../src/shared/money");
const Wallet = require("../models/walletModel");
const smLedgerService = require("../src/modules/wallet/sm-ledger");

/**
 * Wallet Service — Bridge layer between old Wallet model and new SM Ledger.
 *
 *   - Balance is always computed from sm_ledger (never from Wallet.balance)
 *   - PIN management still lives on the Wallet model
 *   - Wallet.balance is kept in sync as a CACHE for performance on
 *     non-critical reads (e.g., push notification text), but the ledger
 *     aggregation is the authoritative source.
 * All credit/debit operations go through smLedgerService for legacy callers.
 */

/**
 * Get or create wallet for a user.
 * Auto-creates a wallet with zero balance on first access.
 * Still needed: PIN storage lives on the Wallet document.
 */
const getOrCreateWallet = async (userId, session = null) => {
  const query = Wallet.findOne({ userId });
  let wallet = await (session ? query.session(session) : query);
  if (!wallet) {
    const data = {
      userId,
      balance: 0,
      currency: "NPR",
      status: "active",
    };
    wallet = session ? (await Wallet.create([data], { session }))[0] : await Wallet.create(data);
  }
  return wallet;
};

// Ledger failures must propagate; cached balances cannot authorize spending.
const getBalance = async (userId) => (await smLedgerService.computeSpendableBalance(userId)).display;

/**
 * Get full balance details (spendable + locked + expiring).
 */
const getFullBalance = async (userId) => {
  const [spendable, locked, expiringCredits] = await Promise.all([
    smLedgerService.computeSpendableBalance(userId),
    smLedgerService.computeLockedBalance(userId),
    smLedgerService.getExpiringCredits(userId, 30),
  ]);

  // Compute total expiring amount
  const expiringAmount = expiringCredits.reduce(
    (sum, c) => sum + (c.remainingAmount || 0),
    0
  );
  const earliestExpiry =
    expiringCredits.length > 0 ? expiringCredits[0].expires_at : null;

  return {
    spendableBalance: spendable.display,
    rawBalance: spendable.raw,
    isNegative: spendable.isNegative,
    lockedBalance: locked,
    expiringAmount: Math.round(expiringAmount * 100) / 100,
    earliestExpiry,
    expiringCreditsCount: expiringCredits.length,
  };
};

/**
 * Credit funds to user — writes to sm_ledger AND syncs Wallet.balance cache.
 *
 * @param {Object} params
 * @param {String} params.userId
 * @param {Number} params.amount
 * @param {String} params.purpose — maps to sm_ledger type
 * @param {String} [params.referenceType]
 * @param {ObjectId} [params.referenceId]
 * @param {String} [params.remarks]
 * @returns {Promise<{ ledgerEntry: Object, wallet: Object }>}
 */
const creditWallet = async ({
  userId,
  amount,
  purpose,
  referenceType,
  referenceId,
  remarks,
  session: existingSession = null,
}) => withMongoTransaction(mongoose, existingSession, async session => {
  amount = fromMinorUnits(toMinorUnits(amount, { allowZero: false }));

  // Ensure wallet exists (for PIN and status check)
  const wallet = await getOrCreateWallet(userId, session);

  if (wallet.status !== "active" && purpose !== "refund") {
    throw new Error("Wallet is frozen. Contact support.");
  }

  // Map old purpose names to new sm_ledger types
  const typeMap = {
    refund: "REFUND",
    ticket_purchase: "DEBIT", // This shouldn't be called for credits, but guard
    bonus: "ADMIN_CREDIT",
    cashback: "CASHBACK",
    promotional: "ADMIN_CREDIT",
    admin_adjustment: "ADMIN_CREDIT",
    reversal: "DEBIT_REVERSAL",
  };

  const ledgerType = typeMap[purpose] || "ADMIN_CREDIT";

  // Write to sm_ledger (the source of truth)
  const ledgerEntry = await smLedgerService.creditLedger({
    userId,
    type: ledgerType,
    amount,
    bookingId: referenceType === "booking" || referenceType === "refund" ? referenceId : null,
    note: remarks || `SM Money credited: Rs. ${amount} (${purpose})`,
    session,
  });

  // Sync Wallet.balance cache (not authoritative, but keeps old reads working)
  await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { balance: amount } },
    { new: true, ...(session ? { session } : {}) }
  );

  return { ledgerEntry, wallet };
});

/**
 * Debit funds from user wallet — uses FIFO consumption via sm_ledger.
 *
 * @param {Object} params
 * @returns {Promise<{ ledgerEntry: Object, wallet: Object }>}
 */
const debitWallet = async ({
  userId,
  amount,
  purpose,
  referenceType,
  referenceId,
  remarks,
  session: existingSession = null,
}) => withMongoTransaction(mongoose, existingSession, async session => {
  amount = fromMinorUnits(toMinorUnits(amount, { allowZero: false }));

  const wallet = await getOrCreateWallet(userId, session);

  if (wallet.status !== "active") {
    throw new Error("Wallet is frozen. Contact support.");
  }

  // Use FIFO debit via sm_ledger
  const ledgerEntry = await smLedgerService.debitLedgerFIFO({
    userId,
    amount,
    bookingId: referenceType === "booking" ? referenceId : null,
    note: remarks || `SM Money debited: Rs. ${amount} (${purpose})`,
    session,
  });

  // Sync Wallet.balance cache
  await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { balance: -amount } },
    { new: true, session }
  );

  return { ledgerEntry, wallet };
});

module.exports = {
  getOrCreateWallet,
  getBalance,
  getFullBalance,
  creditWallet,
  debitWallet,
};
