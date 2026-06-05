const mongoose = require("mongoose");
const SMLedger = require("../models/smLedgerModel");
const ScratchCard = require("../models/scratchCardModel");
const PlatformConfig = require("../models/platformConfigModel");

/**
 * SM Ledger Service — Core Financial Engine for Shuvmarg Money
 *
 * This is the single source of truth for all SM Money operations.
 * Every function here writes to the append-only sm_ledger collection.
 *
 * CRITICAL RULES:
 *   1. Balance is ALWAYS computed via aggregation — never read from a stored field
 *   2. Amount field is ALWAYS positive — direction is a separate field
 *   3. Records are NEVER updated or deleted — corrections are new entries
 *   4. FIFO consumption: oldest-expiring credits are spent first
 *   5. All monetary operations use MongoDB sessions for atomicity
 */

// ═══════════════════════════════════════════════════════════════════════
// BALANCE COMPUTATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Compute spendable balance for a user.
 * Spendable = sum(ACTIVE credits with valid expiry)
 *
 * @param {String|ObjectId} userId
 * @returns {Promise<{ display: Number, raw: Number, isNegative: Boolean }>}
 */
async function computeSpendableBalance(userId) {
  const userOid =
    typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;

  // Spendable balance = sum of remainingAmount on ACTIVE, non-expired credits.
  // This is the spec-correct approach: credits track their own partial consumption
  // via remainingAmount, so we don't need a separate debit sum.
  const result = await SMLedger.aggregate([
    {
      $match: {
        userId: userOid,
        direction: "CREDIT",
        status: "ACTIVE",
        remainingAmount: { $gt: 0 },
        expires_at: { $gt: new Date() },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$remainingAmount" },
      },
    },
  ]);

  const spendable = result.length > 0 ? result[0].total : 0;

  return {
    display: Math.max(0, Math.round(spendable * 100) / 100),
    raw: Math.round(spendable * 100) / 100,
    isNegative: spendable < 0,
  };
}

/**
 * Compute locked balance (referral locked amounts).
 *
 * @param {String|ObjectId} userId
 * @returns {Promise<Number>}
 */
async function computeLockedBalance(userId) {
  const userOid =
    typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;

  const result = await SMLedger.aggregate([
    {
      $match: {
        userId: userOid,
        direction: "CREDIT",
        type: "REFERRAL_LOCKED",
        status: "LOCKED",
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
      },
    },
  ]);

  return result.length > 0 ? result[0].total : 0;
}

/**
 * Get credits expiring within N days — for UI expiry banners.
 *
 * @param {String|ObjectId} userId
 * @param {Number} withinDays — default 30
 * @returns {Promise<Array>} — array of { _id, amount, remainingAmount, expires_at, type }
 */
async function getExpiringCredits(userId, withinDays = 30) {
  const userOid =
    typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;

  const now = new Date();
  const deadline = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

  return SMLedger.find({
    userId: userOid,
    direction: "CREDIT",
    status: "ACTIVE",
    remainingAmount: { $gt: 0 },
    expires_at: { $gt: now, $lte: deadline },
  })
    .select("amount remainingAmount expires_at type createdAt")
    .sort({ expires_at: 1 })
    .lean();
}

// ═══════════════════════════════════════════════════════════════════════
// CREDIT OPERATIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a CREDIT entry in the ledger.
 *
 * @param {Object} params
 * @param {String|ObjectId} params.userId
 * @param {String} params.type — e.g. CASHBACK, REFUND, ADMIN_CREDIT
 * @param {Number} params.amount — always positive
 * @param {String|ObjectId} [params.bookingId]
 * @param {String|ObjectId} [params.referralId]
 * @param {String|ObjectId} [params.relatedLedgerEntryId]
 * @param {String} [params.status] — defaults to ACTIVE
 * @param {Number} [params.expiresInMonths] — defaults to config value (12)
 * @param {Number} [params.bookingNumber] — for REFERRAL_UNLOCK
 * @param {String} [params.note]
 * @param {mongoose.ClientSession} [params.session] — for transactions
 * @returns {Promise<Object>} — the created ledger entry
 */
async function creditLedger({
  userId,
  type,
  amount,
  bookingId = null,
  referralId = null,
  relatedLedgerEntryId = null,
  status = "ACTIVE",
  expiresInMonths = null,
  bookingNumber = null,
  note = null,
  session = null,
}) {
  if (amount <= 0) throw new Error("Credit amount must be greater than zero");

  // Get expiry config if not explicitly provided
  if (expiresInMonths === null) {
    const config = await PlatformConfig.getConfig("sm_money_config");
    expiresInMonths = config.creditExpiryMonths || 12;
  }

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + expiresInMonths);

  const entryData = {
    userId,
    bookingId,
    referralId,
    relatedLedgerEntryId,
    type,
    direction: "CREDIT",
    amount,
    status,
    bookingNumber,
    expires_at: status === "LOCKED" ? null : expiresAt, // Locked entries don't expire on their own
    remainingAmount: status === "ACTIVE" ? amount : 0,  // Only ACTIVE credits have spendable remaining
    note,
  };

  const opts = session ? { session } : {};
  const entries = await SMLedger.create([entryData], opts);
  return entries[0];
}

/**
 * Create a DEBIT entry (simple, non-FIFO — for clawbacks, expiry, admin).
 *
 * @param {Object} params
 * @returns {Promise<Object>}
 */
async function debitLedgerSimple({
  userId,
  type,
  amount,
  bookingId = null,
  referralId = null,
  relatedLedgerEntryId = null,
  note = null,
  session = null,
}) {
  if (amount <= 0) throw new Error("Debit amount must be greater than zero");

  const entryData = {
    userId,
    bookingId,
    referralId,
    relatedLedgerEntryId,
    type,
    direction: "DEBIT",
    amount,
    status: "PROCESSED",
    expires_at: null,
    remainingAmount: null,
    note,
  };

  const opts = session ? { session } : {};
  const entries = await SMLedger.create([entryData], opts);
  return entries[0];
}

// ═══════════════════════════════════════════════════════════════════════
// FIFO DEBIT — THE CRITICAL PATH
// ═══════════════════════════════════════════════════════════════════════

/**
 * Debit SM Money using FIFO (First-In-First-Out by expiry date).
 *
 * From spec §6.5:
 *   1. Fetch all ACTIVE credits for user, ordered by expires_at ASC
 *   2. Consume credits from oldest-expiring first until amount is covered
 *   3. Partial credit consumption is tracked in the DEBIT entry's consumedBy[]
 *   4. Each consumed credit's remainingAmount is decremented
 *
 * Uses a MongoDB session for atomicity — all or nothing.
 *
 * @param {Object} params
 * @param {String|ObjectId} params.userId
 * @param {Number} params.amount — total amount to debit
 * @param {String|ObjectId} [params.bookingId]
 * @param {String} [params.note]
 * @returns {Promise<Object>} — the created DEBIT ledger entry with consumedBy details
 * @throws {Error} if insufficient balance
 */
async function debitLedgerFIFO({ userId, amount, bookingId = null, note = null }) {
  if (amount <= 0) throw new Error("Debit amount must be greater than zero");

  const userOid =
    typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Check total available balance first
    const balanceResult = await SMLedger.aggregate([
      {
        $match: {
          userId: userOid,
          direction: "CREDIT",
          status: "ACTIVE",
          remainingAmount: { $gt: 0 },
          expires_at: { $gt: new Date() },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$remainingAmount" },
        },
      },
    ]).session(session);

    const availableBalance =
      balanceResult.length > 0 ? balanceResult[0].total : 0;

    if (availableBalance < amount) {
      await session.abortTransaction();
      throw new Error(
        `Insufficient Shuvmarg Money. Available: Rs. ${Math.max(0, Math.round(availableBalance))}, Required: Rs. ${amount}`
      );
    }

    // 2. Fetch ACTIVE credits ordered by oldest-expiring first (FIFO)
    const credits = await SMLedger.find({
      userId: userOid,
      direction: "CREDIT",
      status: "ACTIVE",
      remainingAmount: { $gt: 0 },
      expires_at: { $gt: new Date() },
    })
      .sort({ expires_at: 1 })
      .session(session);

    // 3. Consume credits in FIFO order
    let remaining = amount;
    const consumedBy = [];

    for (const credit of credits) {
      if (remaining <= 0) break;

      const consumeAmount = Math.min(credit.remainingAmount, remaining);

      // Decrement the credit's remaining amount
      credit.remainingAmount -= consumeAmount;

      // If fully consumed, mark as USED
      if (credit.remainingAmount <= 0) {
        credit.remainingAmount = 0;
        credit.status = "USED";
      }

      await credit.save({ session });

      consumedBy.push({
        debitLedgerEntryId: null, // Will be set after debit entry is created
        amountConsumed: consumeAmount,
        _creditEntryId: credit._id, // Temporary — for linking
      });

      remaining -= consumeAmount;
    }

    // 4. Create the DEBIT entry
    const debitEntry = (
      await SMLedger.create(
        [
          {
            userId: userOid,
            bookingId,
            type: "DEBIT",
            direction: "DEBIT",
            amount,
            status: "PROCESSED",
            expires_at: null,
            remainingAmount: null,
            note: note || `SM Money spent: Rs. ${amount}`,
            consumedBy: consumedBy.map((c) => ({
              debitLedgerEntryId: c._creditEntryId, // Store which credit was consumed
              amountConsumed: c.amountConsumed,
            })),
          },
        ],
        { session }
      )
    )[0];

    // 5. Update each consumed credit's consumedBy array to reference this debit
    for (const consumption of consumedBy) {
      await SMLedger.updateOne(
        { _id: consumption._creditEntryId },
        {
          $push: {
            consumedBy: {
              debitLedgerEntryId: debitEntry._id,
              amountConsumed: consumption.amountConsumed,
            },
          },
        },
        { session }
      );
    }

    await session.commitTransaction();
    return debitEntry;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CASHBACK GENERATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a bounded random cashback amount using a right-skewed distribution.
 *
 * From spec §2.2:
 *   - Min: NPR 5, Max: NPR 30
 *   - Never more than 15% of base ticket price
 *   - Below NPR 100 ticket: cap at 10% instead
 *   - Right-skewed: most users get NPR 5-15
 *   - Skew level 1-5 (admin-configurable)
 *
 * @param {Number} baseTicketPrice
 * @param {Object} config — from PlatformConfig
 * @returns {Number} — cashback amount in NPR (integer)
 */
function calculateCashbackAmount(baseTicketPrice, config) {
  const {
    skewLevel = 3,
    minNPR = 5,
    maxNPR = 30,
    maxPercentOfTicket = 15,
    lowTicketThreshold = 100,
    lowTicketMaxPercent = 10,
  } = config;

  // Right-skewed distribution using power function
  // Higher skew level = more generous (more weight toward maxNPR)
  // Lower skew level = more conservative (most get near minNPR)
  const skewFactor = 1 + (5 - skewLevel) * 0.5; // skew 1 → 3.0, skew 5 → 1.0
  const random = Math.pow(Math.random(), skewFactor); // Right-skewed [0, 1)
  let cashback = Math.round(minNPR + random * (maxNPR - minNPR));

  // Apply percentage guard
  const percentCap =
    baseTicketPrice < lowTicketThreshold
      ? lowTicketMaxPercent
      : maxPercentOfTicket;
  const maxByPercent = Math.floor((baseTicketPrice * percentCap) / 100);

  cashback = Math.min(cashback, maxByPercent);
  cashback = Math.max(cashback, minNPR); // Never below floor
  cashback = Math.min(cashback, maxNPR); // Never above cap

  return cashback;
}

/**
 * Generate cashback for a confirmed booking.
 * Creates both a CASHBACK credit in sm_ledger and an UNSCRATCHED scratch card.
 *
 * From spec §2.1:
 *   - Cashback is immediately credited (visible in balance)
 *   - Scratch card hides the amount until user scratches
 *   - One card per booking regardless of passenger count
 *   - Only the account holder receives cashback
 *   - Cashback calculated on BASE ticket price (not after discounts)
 *
 * @param {Object} params
 * @param {String|ObjectId} params.userId
 * @param {String|ObjectId} params.bookingId
 * @param {Number} params.baseTicketPrice — price BEFORE discounts
 * @returns {Promise<{ ledgerEntry: Object, scratchCard: Object }>}
 */
async function generateCashback({ userId, bookingId, baseTicketPrice }) {
  const config = await PlatformConfig.getConfig("cashback_config");
  const smConfig = await PlatformConfig.getConfig("sm_money_config");

  const cashbackAmount = calculateCashbackAmount(baseTicketPrice, config);

  // ── Pick a random scratch card theme ────────────────────────────────
  // This runs BEFORE the transaction. If theme lookup fails, we fall back
  // to the default (no image, solid lime color on mobile). A theme config
  // failure must NEVER prevent a booking from completing.
  let selectedTheme = { name: "Default", imageKey: null };
  try {
    const themes = await PlatformConfig.getConfig("scratch_card_themes");
    if (Array.isArray(themes)) {
      const activeThemes = themes.filter((t) => t.isActive && t.imageKey);
      if (activeThemes.length > 0) {
        // Weighted random selection using cumulative distribution
        const totalWeight = activeThemes.reduce((sum, t) => sum + (t.weight || 1), 0);
        const roll = Math.random() * totalWeight;
        let cumulative = 0;
        for (const theme of activeThemes) {
          cumulative += (theme.weight || 1);
          if (roll < cumulative) {
            selectedTheme = { name: theme.name, imageKey: theme.imageKey };
            break;
          }
        }
      }
    }
  } catch (themeErr) {
    // Non-fatal — log and proceed with default theme
    console.warn("[generateCashback] Theme selection failed, using default:", themeErr.message);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Create CASHBACK credit in ledger
    const ledgerEntry = await creditLedger({
      userId,
      type: "CASHBACK",
      amount: cashbackAmount,
      bookingId,
      expiresInMonths: smConfig.creditExpiryMonths || 12,
      note: `Cashback earned on booking. Base ticket: Rs. ${baseTicketPrice}`,
      session,
    });

    // 2. Create scratch card (with theme snapshot)
    const scratchExpiryDays = smConfig.scratchCardExpiryDays || 90;
    const scratchExpiresAt = new Date();
    scratchExpiresAt.setDate(scratchExpiresAt.getDate() + scratchExpiryDays);

    const scratchCard = (
      await ScratchCard.create(
        [
          {
            userId,
            bookingId,
            amount: cashbackAmount,
            status: "UNSCRATCHED",
            ledgerEntryId: ledgerEntry._id,
            expiresAt: scratchExpiresAt,
            themeName: selectedTheme.name,
            imageUrl: selectedTheme.imageKey, // S3 key — resolved to presigned URL on read
          },
        ],
        { session }
      )
    )[0];

    await session.commitTransaction();
    return { ledgerEntry, scratchCard };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CLAWBACK — CASHBACK REVERSAL ON BOOKING CANCELLATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Claw back cashback when a booking is cancelled.
 *
 * From spec §2.5:
 *   1. Find all CASHBACK credits linked to this bookingId
 *   2. Create a DEBIT entry for each (type: CASHBACK_CLAWBACK)
 *   3. Update the original credit's status to CLAWED_BACK
 *   4. Update the scratch card status to CLAWED_BACK
 *   5. If user already spent the cashback, balance can go negative
 *
 * @param {String|ObjectId} bookingId
 * @returns {Promise<{ clawedBack: Number, entriesCreated: Number }>}
 */
async function clawbackCashback(bookingId) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Find all CASHBACK credits for this booking
    const cashbackCredits = await SMLedger.find({
      bookingId,
      type: "CASHBACK",
      direction: "CREDIT",
      status: { $in: ["ACTIVE", "USED"] }, // Can claw back even if already spent
    }).session(session);

    let totalClawedBack = 0;
    let entriesCreated = 0;

    for (const credit of cashbackCredits) {
      // 2. Create CLAWBACK debit entry
      await debitLedgerSimple({
        userId: credit.userId,
        type: "CASHBACK_CLAWBACK",
        amount: credit.amount, // Claw back the FULL original amount
        bookingId,
        relatedLedgerEntryId: credit._id,
        note: `Cashback reversed: booking ${bookingId} cancelled. Original credit: Rs. ${credit.amount}`,
        session,
      });

      // 3. Mark the original credit as CLAWED_BACK
      credit.status = "CLAWED_BACK";
      credit.remainingAmount = 0;
      await credit.save({ session });

      totalClawedBack += credit.amount;
      entriesCreated++;
    }

    // 4. Update scratch card(s) for this booking
    await ScratchCard.updateMany(
      { bookingId, status: { $in: ["UNSCRATCHED", "SCRATCHED"] } },
      { $set: { status: "CLAWED_BACK" } },
      { session }
    );

    await session.commitTransaction();
    return { clawedBack: totalClawedBack, entriesCreated };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// DEBIT REVERSAL — GATEWAY FAILURE ROLLBACK
// ═══════════════════════════════════════════════════════════════════════

/**
 * Reverse a DEBIT entry when a gateway payment fails after SM Money was deducted.
 *
 * From spec §11.3 (edge case):
 *   - Compensating CREDIT entry (type: DEBIT_REVERSAL) created immediately
 *   - SM Money fully restored
 *   - Booking → FAILED state
 *
 * CORRECTNESS NOTE:
 *   A single credit can be partially consumed by MULTIPLE debit entries.
 *   Example: Credit X (Rs. 50) consumed Rs. 20 by Debit A and Rs. 30 by Debit B.
 *   If we reverse Debit A, we must:
 *     1. Restore Rs. 20 to Credit X's remainingAmount (50 → 20 → now back to 20+20=??)
 *        No — remainingAmount was decremented to 0 when both debits ran.
 *        Reversing Debit A restores +20, so remainingAmount goes from 0 → 20.
 *     2. If Credit X was marked USED (remainingAmount was 0), and after restoration
 *        remainingAmount > 0, set it back to ACTIVE.
 *     3. Remove the consumption record for this debit from Credit X's consumedBy[].
 *   We must NOT blindly set status = ACTIVE — only transition USED → ACTIVE when
 *   the credit actually has available balance again.
 *
 * @param {String|ObjectId} debitLedgerEntryId — the DEBIT entry to reverse
 * @returns {Promise<Object>} — the reversal CREDIT entry
 */
async function reverseDebit(debitLedgerEntryId) {
  const debitEntry = await SMLedger.findById(debitLedgerEntryId);
  if (!debitEntry) throw new Error("Debit entry not found");
  if (debitEntry.direction !== "DEBIT")
    throw new Error("Can only reverse DEBIT entries");
  if (debitEntry.type === "CASHBACK_CLAWBACK")
    throw new Error("Cannot reverse clawbacks via reverseDebit — use admin void");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Restore the consumed credits — carefully, not blindly
    if (debitEntry.consumedBy && debitEntry.consumedBy.length > 0) {
      for (const consumption of debitEntry.consumedBy) {
        // consumption.debitLedgerEntryId is actually the CREDIT entry ID
        // (confusing name inherited from the schema — it's the credit that was consumed)
        const creditEntryId = consumption.debitLedgerEntryId;
        const restoreAmount = consumption.amountConsumed;

        // Fetch the credit entry to check its current state
        const creditEntry = await SMLedger.findById(creditEntryId).session(session);
        if (!creditEntry) {
          // Credit was deleted/voided — skip (should never happen in append-only ledger)
          continue;
        }

        // Only restore credits that are in a reversible state
        // CLAWED_BACK, VOIDED, EXPIRED credits should NOT be restored
        if (!["ACTIVE", "USED"].includes(creditEntry.status)) {
          continue;
        }

        // Increment remaining amount
        const newRemaining = (creditEntry.remainingAmount || 0) + restoreAmount;

        // Determine new status:
        // - If it was USED (remainingAmount was 0) and now has balance → ACTIVE
        // - If it was already ACTIVE (partial consumption) → stays ACTIVE
        // - Never exceed original amount
        const cappedRemaining = Math.min(newRemaining, creditEntry.amount);
        const newStatus = cappedRemaining > 0 ? "ACTIVE" : creditEntry.status;

        await SMLedger.updateOne(
          { _id: creditEntryId },
          {
            $set: {
              remainingAmount: cappedRemaining,
              status: newStatus,
            },
            // Remove the consumption record for THIS specific debit
            $pull: {
              consumedBy: { debitLedgerEntryId: debitEntry._id },
            },
          },
          { session }
        );
      }
    }

    // 2. Mark the original debit entry with a reversal note
    //    (append-only: we don't delete it, just annotate)
    await SMLedger.updateOne(
      { _id: debitEntry._id },
      {
        $set: {
          note: (debitEntry.note || "") + " [REVERSED]",
        },
      },
      { session }
    );

    // 3. Create reversal credit entry — this is the compensating record
    const reversalEntry = await creditLedger({
      userId: debitEntry.userId,
      type: "DEBIT_REVERSAL",
      amount: debitEntry.amount,
      bookingId: debitEntry.bookingId,
      relatedLedgerEntryId: debitEntry._id,
      note: `SM Money restored: gateway payment failed. Original debit (Rs. ${debitEntry.amount}) reversed.`,
      session,
    });

    await session.commitTransaction();
    return reversalEntry;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// ACTIVITY FEED
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get paginated activity feed for a user's SM Money.
 *
 * @param {String|ObjectId} userId
 * @param {Object} options
 * @param {Number} options.page
 * @param {Number} options.limit
 * @param {String} [options.typeFilter] — "all", "cashback", "referral", "refunds", "spent"
 * @returns {Promise<{ entries: Array, totalCount: Number, pagination: Object }>}
 */
async function getActivityFeed(userId, { page = 1, limit = 20, typeFilter = "all" } = {}) {
  const userOid =
    typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;

  const matchStage = { userId: userOid };

  // Apply type filter
  switch (typeFilter) {
    case "cashback":
      matchStage.type = { $in: ["CASHBACK", "CASHBACK_CLAWBACK"] };
      break;
    case "referral":
      matchStage.type = { $in: ["REFERRAL_LOCKED", "REFERRAL_UNLOCK"] };
      break;
    case "refunds":
      matchStage.type = "REFUND";
      break;
    case "spent":
      matchStage.type = { $in: ["DEBIT", "DEBIT_REVERSAL"] };
      break;
    // "all" — no type filter
  }

  const skip = (page - 1) * limit;

  const [entries, totalCount] = await Promise.all([
    SMLedger.find(matchStage)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("bookingId", "ticketId seats")
      .lean(),
    SMLedger.countDocuments(matchStage),
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
}

module.exports = {
  computeSpendableBalance,
  computeLockedBalance,
  getExpiringCredits,
  creditLedger,
  debitLedgerSimple,
  debitLedgerFIFO,
  generateCashback,
  calculateCashbackAmount,
  clawbackCashback,
  reverseDebit,
  getActivityFeed,
};
