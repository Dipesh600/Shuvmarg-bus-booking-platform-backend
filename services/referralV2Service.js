const mongoose = require("mongoose");
const ReferralV2 = require("../models/referralV2Model");
const User = require("../models/userModel");
const Booking = require("../models/bookTicketModel");
const smLedgerService = require("./smLedgerService");
const {
  createLocalNotification,
} = require("../controllers/notificationController/notification_manager");

/**
 * Referral V2 Service — Progressive Unlock Engine
 *
 * SPEC REFERENCE: shuvmarg-money-spec.md §3
 *
 * This is the single source of truth for all Referral V2 business logic.
 * Controllers call these functions — they never manipulate ReferralV2
 * documents or SM Ledger entries directly.
 *
 * ARCHITECTURE:
 *   referralController.js → referralV2Service.js → smLedgerService.js
 *                                                → ReferralV2 model
 *                                                → notification_manager
 */

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTS (from spec §3.1)
// ═══════════════════════════════════════════════════════════════════════

/** Progressive unlock amounts per journey number */
const UNLOCK_SCHEDULE = { 1: 30, 2: 20, 3: 20, 4: 20, 5: 10 };

/** Total referral reward in NPR */
const TOTAL_REFERRAL_REWARD = 100;

/** Referral expiry: days from referred user's signup */
const REFERRAL_EXPIRY_DAYS = 60;

/** Max time after signup to apply a referral code (hours) */
const CODE_APPLICATION_WINDOW_HOURS = 24;

/** Fraud threshold: max referrals from same referrer in 7 days */
const FRAUD_REFERRAL_THRESHOLD = 5;
const FRAUD_WINDOW_DAYS = 7;

// ═══════════════════════════════════════════════════════════════════════
// CREATE REFERRAL
// ═══════════════════════════════════════════════════════════════════════

/**
 * Create a new V2 referral relationship.
 *
 * Called when User B applies User A's referral code.
 *
 * Steps (spec §3.3):
 *   1. Validate: not self-refer, within 24h window, no first completed journey
 *   2. Create ReferralV2 document
 *   3. Create REFERRAL_LOCKED ledger entry (NPR 100) for referrer
 *   4. Tag referred user with referredBy
 *   5. Run fraud pattern check (non-blocking)
 *   6. Send notification to referrer
 *
 * @param {Object} params
 * @param {String} params.referrerId - User A's ID (code owner)
 * @param {String} params.referredUserId - User B's ID (code applier)
 * @param {String} params.referralCode - The code that was used
 * @param {String} [params.ipAddress] - For fraud detection
 * @param {String} [params.deviceInfo] - For fraud detection
 * @returns {Promise<Object>} The created ReferralV2 document
 */
async function createReferral({
  referrerId,
  referredUserId,
  referralCode,
  ipAddress = null,
  deviceInfo = null,
}) {
  // ── 1. VALIDATION ────────────────────────────────────────────────────

  // Cannot self-refer (spec §3.7)
  if (referrerId.toString() === referredUserId.toString()) {
    throw new Error("You cannot refer yourself.");
  }

  // Fetch both users
  const [referrer, referredUser] = await Promise.all([
    User.findById(referrerId).lean(),
    User.findById(referredUserId).lean(),
  ]);

  if (!referrer) throw new Error("Referrer not found.");
  if (!referredUser) throw new Error("Referred user not found.");

  // User B must not already be referred (unique index will also catch this)
  if (referredUser.referredBy) {
    throw new Error("This user already has a referral code applied.");
  }

  // 24-hour window check (spec §3.3):
  // Code only accepted within 24h of signup
  const hoursSinceSignup =
    (Date.now() - new Date(referredUser.createdAt).getTime()) / (1000 * 60 * 60);

  if (hoursSinceSignup > CODE_APPLICATION_WINDOW_HOURS) {
    throw new Error(
      "Referral code can only be applied within 24 hours of signing up."
    );
  }

  // Check if referred user has already completed a journey (spec §3.3):
  // "before their first journey is completed — after that, code is locked in permanently"
  const hasCompletedJourney = await _hasCompletedAnyJourney(referredUserId);
  if (hasCompletedJourney) {
    throw new Error(
      "Referral code can't be applied after your first trip is completed."
    );
  }

  // ── 2. CREATE REFERRAL + LEDGER IN TRANSACTION ─────────────────────

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Calculate expiry: 60 days from referred user's signup
    const expiresAt = new Date(referredUser.createdAt);
    expiresAt.setDate(expiresAt.getDate() + REFERRAL_EXPIRY_DAYS);

    // Create REFERRAL_LOCKED ledger entry (NPR 100, status: LOCKED)
    const lockedEntry = await smLedgerService.creditLedger({
      userId: referrerId,
      type: "REFERRAL_LOCKED",
      amount: TOTAL_REFERRAL_REWARD,
      status: "LOCKED",
      note: `Referral reward locked: ${referralCode} used by ${referredUser.name || referredUser.phone}. Unlocks as your friend completes trips.`,
      session,
    });

    // Create ReferralV2 document
    const [referral] = await ReferralV2.create(
      [
        {
          referrerId,
          referredUserId,
          referralCode,
          status: "ACTIVE",
          journeysCompleted: 0,
          totalUnlocked: 0,
          lockedRemaining: TOTAL_REFERRAL_REWARD,
          expiresAt,
          lockedLedgerEntryId: lockedEntry._id,
        },
      ],
      { session }
    );

    // Tag referred user with referredBy
    await User.updateOne(
      { _id: referredUserId },
      { $set: { referredBy: referrerId } },
      { session }
    );

    await session.commitTransaction();

    // ── 3. POST-TRANSACTION (non-blocking) ─────────────────────────────

    // Fraud check (fire-and-forget)
    _checkFraudPatterns(referrerId, ipAddress, deviceInfo).catch((err) => {
      console.error("Referral fraud check failed (non-blocking):", err.message);
    });

    // Notify referrer (fire-and-forget)
    _notifyReferrer(
      referrerId,
      "REFERRAL_FRIEND_JOINED",
      "Your friend joined Shuvmarg!",
      "NPR 100 is waiting to unlock."
    ).catch((err) => {
      console.error("Referral notification failed (non-blocking):", err.message);
    });

    return referral;
  } catch (error) {
    await session.abortTransaction();

    // Handle duplicate key error (unique index on referredUserId)
    if (error.code === 11000) {
      throw new Error("This user already has a referral code applied.");
    }

    throw error;
  } finally {
    session.endSession();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// JOURNEY COMPLETION → PROGRESSIVE UNLOCK
// ═══════════════════════════════════════════════════════════════════════

/**
 * Process a referred user's journey completion.
 *
 * Called from fleetWorkstationController when a trip transitions to "completed".
 * For each booking on that trip, if the booking user was referred, this function
 * is called.
 *
 * Steps (spec §3.1, §3.2):
 *   1. Find the ReferralV2 for this referred user
 *   2. Validate: booking not cancelled, ≥ NPR 1 paid, within cap (5 journeys)
 *   3. Increment journeysCompleted
 *   4. Create REFERRAL_UNLOCK credit in referrer's ledger
 *   5. Update totalUnlocked / lockedRemaining
 *   6. Transition status if needed
 *   7. Notify referrer
 *
 * @param {String} referredUserId - The user who completed the journey
 * @param {String} bookingId - The booking that was on the completed trip
 * @returns {Promise<Object|null>} The updated referral, or null if not applicable
 */
async function processJourneyCompletion(referredUserId, bookingId) {
  // 1. Find the referral for this user
  const referral = await ReferralV2.findOne({
    referredUserId,
    status: { $in: ["ACTIVE", "PARTIALLY_UNLOCKED"] },
  });

  // Not a referred user, or referral already fully unlocked/expired/voided
  if (!referral) return null;

  // 2. Validate the booking (spec §3.2)
  const booking = await Booking.findById(bookingId).lean();
  if (!booking) return null;

  // Booking must not be cancelled
  if (booking.status === "cancelled") return null;

  // Booking must be on the referred user's account
  if (booking.userId.toString() !== referredUserId.toString()) return null;

  // At minimum NPR 1 was paid — fully gifted ticket does not count
  const totalPaid = (booking.totalAmount || 0);
  if (totalPaid < 1) return null;

  // Already at max 5 journeys
  if (referral.journeysCompleted >= 5) return null;

  // Dedup: check if this booking already triggered an unlock
  const alreadyUnlocked = referral.unlockHistory.some(
    (entry) => entry.bookingId.toString() === bookingId.toString()
  );
  if (alreadyUnlocked) return null;

  // 3. Calculate unlock amount
  const nextJourney = referral.journeysCompleted + 1;
  const unlockAmount = UNLOCK_SCHEDULE[nextJourney];
  if (!unlockAmount) return null; // Safety: should never happen

  // 4. Execute unlock in transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Create REFERRAL_UNLOCK credit in referrer's ledger
    const unlockEntry = await smLedgerService.creditLedger({
      userId: referral.referrerId,
      type: "REFERRAL_UNLOCK",
      amount: unlockAmount,
      referralId: referral._id,
      bookingNumber: nextJourney,
      note: `Referral unlock: friend completed trip #${nextJourney}. NPR ${unlockAmount} unlocked.`,
      session,
    });

    // Update referral document
    const newTotalUnlocked = referral.totalUnlocked + unlockAmount;
    const newLockedRemaining = TOTAL_REFERRAL_REWARD - newTotalUnlocked;
    const isFullyUnlocked = nextJourney >= 5;

    const newStatus = isFullyUnlocked ? "FULLY_UNLOCKED" : "PARTIALLY_UNLOCKED";

    await ReferralV2.updateOne(
      { _id: referral._id },
      {
        $set: {
          journeysCompleted: nextJourney,
          totalUnlocked: newTotalUnlocked,
          lockedRemaining: newLockedRemaining,
          status: newStatus,
        },
        $push: {
          unlockHistory: {
            bookingId,
            journeyNumber: nextJourney,
            amountUnlocked: unlockAmount,
            ledgerEntryId: unlockEntry._id,
            unlockedAt: new Date(),
          },
        },
      },
      { session }
    );

    // If fully unlocked, mark the original REFERRAL_LOCKED entry as USED
    if (isFullyUnlocked && referral.lockedLedgerEntryId) {
      const SMLedger = require("../models/smLedgerModel");
      await SMLedger.updateOne(
        { _id: referral.lockedLedgerEntryId },
        { $set: { status: "USED" } },
        { session }
      );
    }

    await session.commitTransaction();

    // 5. Notify referrer (fire-and-forget)
    const referrer = await User.findById(referral.referrerId)
      .select("name")
      .lean();

    if (isFullyUnlocked) {
      _notifyReferrer(
        referral.referrerId,
        "REFERRAL_FULLY_UNLOCKED",
        "Full Reward Earned! 🎉",
        `You've earned your full NPR ${TOTAL_REFERRAL_REWARD}! Your friend has completed 5 trips.`
      ).catch(() => {});
    } else {
      // Compute current SM Money balance for the notification
      const balance = await smLedgerService.computeSpendableBalance(
        referral.referrerId
      );

      _notifyReferrer(
        referral.referrerId,
        "REFERRAL_UNLOCK",
        "Referral Reward Unlocked",
        `Your friend completed a trip — NPR ${unlockAmount} unlocked. You now have NPR ${balance.display} SM Money.`
      ).catch(() => {});
    }

    return {
      referralId: referral._id,
      journeyNumber: nextJourney,
      amountUnlocked: unlockAmount,
      totalUnlocked: newTotalUnlocked,
      lockedRemaining: newLockedRemaining,
      status: newStatus,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// DASHBOARD & STATUS QUERIES
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get referral dashboard for a referrer.
 * Returns all their referrals with per-referral progress.
 *
 * @param {String} referrerId
 * @returns {Promise<Object>}
 */
async function getReferralDashboard(referrerId) {
  const user = await User.findById(referrerId)
    .select("referralCode name")
    .lean();

  if (!user) throw new Error("User not found.");

  const referrals = await ReferralV2.find({ referrerId })
    .populate("referredUserId", "name phone createdAt")
    .sort({ createdAt: -1 })
    .lean();

  // Compute summary stats
  const totalReferrals = referrals.length;
  const activeReferrals = referrals.filter(
    (r) => r.status === "ACTIVE" || r.status === "PARTIALLY_UNLOCKED"
  ).length;
  const fullyUnlocked = referrals.filter(
    (r) => r.status === "FULLY_UNLOCKED"
  ).length;
  const expiredReferrals = referrals.filter(
    (r) => r.status === "EXPIRED"
  ).length;

  const totalEarned = referrals.reduce(
    (sum, r) => sum + (r.totalUnlocked || 0),
    0
  );
  const totalLocked = referrals.reduce(
    (sum, r) =>
      sum +
      (["ACTIVE", "PARTIALLY_UNLOCKED"].includes(r.status)
        ? r.lockedRemaining
        : 0),
    0
  );

  // Format referrals for response
  const formattedReferrals = referrals.map((r) => ({
    id: r._id,
    referredUser: {
      name: r.referredUserId?.name || "User",
      phone: r.referredUserId?.phone,
      joinedAt: r.referredUserId?.createdAt,
    },
    status: r.status,
    journeysCompleted: r.journeysCompleted,
    totalUnlocked: r.totalUnlocked,
    lockedRemaining: r.lockedRemaining,
    expiresAt: r.expiresAt,
    flaggedForReview: r.flaggedForReview,
    unlockHistory: (r.unlockHistory || []).map((h) => ({
      journeyNumber: h.journeyNumber,
      amountUnlocked: h.amountUnlocked,
      unlockedAt: h.unlockedAt,
    })),
    createdAt: r.createdAt,
  }));

  return {
    referralCode: user.referralCode,
    summary: {
      totalReferrals,
      activeReferrals,
      fullyUnlocked,
      expiredReferrals,
      totalEarned,
      totalLocked,
    },
    referrals: formattedReferrals,
  };
}

/**
 * Get the referral status for a referred user.
 * Shows who referred them and current progress.
 *
 * @param {String} referredUserId
 * @returns {Promise<Object|null>}
 */
async function getReferralStatus(referredUserId) {
  const referral = await ReferralV2.findOne({ referredUserId })
    .populate("referrerId", "name")
    .lean();

  if (!referral) return null;

  return {
    referrerName: referral.referrerId?.name || "A friend",
    status: referral.status,
    journeysCompleted: referral.journeysCompleted,
    totalUnlocked: referral.totalUnlocked,
    lockedRemaining: referral.lockedRemaining,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// ADMIN: VOID REFERRAL
// ═══════════════════════════════════════════════════════════════════════

/**
 * Void a referral (admin action).
 * Creates ADMIN_DEBIT entries for all previously unlocked amounts.
 * If referrer already spent them, their balance goes negative.
 *
 * Spec §3.7: "Flagged referrals go to admin review queue — not auto-voided."
 *
 * @param {String} referralId
 * @param {String} adminId
 * @param {String} reason
 * @returns {Promise<Object>}
 */
async function voidReferral(referralId, adminId, reason) {
  const referral = await ReferralV2.findById(referralId);
  if (!referral) throw new Error("Referral not found.");

  if (referral.status === "VOIDED") {
    throw new Error("Referral is already voided.");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Create ADMIN_DEBIT entries for all previously unlocked amounts
    let totalDebited = 0;
    for (const unlock of referral.unlockHistory) {
      await smLedgerService.debitLedgerSimple({
        userId: referral.referrerId,
        type: "ADMIN_DEBIT",
        amount: unlock.amountUnlocked,
        referralId: referral._id,
        relatedLedgerEntryId: unlock.ledgerEntryId,
        note: `Referral voided by admin: ${reason}. Reversing unlock #${unlock.journeyNumber} (NPR ${unlock.amountUnlocked}).`,
        session,
      });
      totalDebited += unlock.amountUnlocked;
    }

    // 2. Mark the original REFERRAL_LOCKED entry as VOIDED
    if (referral.lockedLedgerEntryId) {
      const SMLedger = require("../models/smLedgerModel");
      await SMLedger.updateOne(
        { _id: referral.lockedLedgerEntryId },
        { $set: { status: "VOIDED" } },
        { session }
      );
    }

    // 3. Update referral status
    referral.status = "VOIDED";
    referral.voidedBy = adminId;
    referral.voidedAt = new Date();
    referral.voidReason = reason;
    await referral.save({ session });

    await session.commitTransaction();

    return {
      referralId: referral._id,
      totalDebited,
      unlocksReversed: referral.unlockHistory.length,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FRAUD DETECTION (spec §3.7)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check for suspicious referral patterns and flag if needed.
 * Non-blocking — always runs async after the referral is created.
 *
 * Rule: Flag if 5+ referrals from same referrer in 7 days.
 * Flagged referrals go to admin review — NOT auto-voided.
 */
async function _checkFraudPatterns(referrerId, ipAddress, deviceInfo) {
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - FRAUD_WINDOW_DAYS);

  const recentCount = await ReferralV2.countDocuments({
    referrerId,
    createdAt: { $gte: windowStart },
  });

  if (recentCount >= FRAUD_REFERRAL_THRESHOLD) {
    const flagReason = `${recentCount} referrals in ${FRAUD_WINDOW_DAYS} days.${
      ipAddress ? ` IP: ${ipAddress}.` : ""
    }${deviceInfo ? ` Device: ${deviceInfo}.` : ""}`;

    // Flag ALL recent referrals from this referrer
    await ReferralV2.updateMany(
      {
        referrerId,
        createdAt: { $gte: windowStart },
        flaggedForReview: false,
      },
      {
        $set: {
          flaggedForReview: true,
          flagReason,
        },
      }
    );

    console.warn(
      `[REFERRAL FRAUD] Referrer ${referrerId} flagged: ${flagReason}`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS (PRIVATE)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Check if a user has completed any journey (has a booked ticket on a completed trip).
 */
async function _hasCompletedAnyJourney(userId) {
  const Trip = require("../models/tripModel");

  // Find any booking by this user where the trip is completed
  const completedBooking = await Booking.findOne({
    userId,
    status: "booked", // Not cancelled
  })
    .populate({
      path: "tripId",
      match: { status: "completed" },
      select: "_id status",
    })
    .lean();

  // If the tripId populate returned a match, trip was completed
  return completedBooking && completedBooking.tripId !== null;
}

/**
 * Send a notification to the referrer.
 * Wraps createLocalNotification for referral-specific events.
 */
async function _notifyReferrer(userId, type, title, body) {
  try {
    await createLocalNotification(userId, type, title, body, {});
  } catch (err) {
    console.error(`Referral notification failed for ${userId}:`, err.message);
  }
}

/**
 * Get the unlock amount for a given journey number.
 * @param {Number} journeyNumber — 1-5
 * @returns {Number|null}
 */
function getUnlockAmount(journeyNumber) {
  return UNLOCK_SCHEDULE[journeyNumber] || null;
}

module.exports = {
  createReferral,
  processJourneyCompletion,
  getReferralDashboard,
  getReferralStatus,
  voidReferral,
  getUnlockAmount,
  UNLOCK_SCHEDULE,
  TOTAL_REFERRAL_REWARD,
};
