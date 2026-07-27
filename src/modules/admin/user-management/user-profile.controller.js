"use strict";

function mapUserProfile(user, bookingMetrics, auditLog, sessionCount, now) {
  const metrics = bookingMetrics[0] || {};
  return {
    profile: user,
    metrics: {
      bookings: {
        total: metrics.total?.[0]?.count || 0,
        completed: metrics.completed?.[0]?.count || 0,
        cancelled: metrics.cancelled?.[0]?.count || 0,
        totalSpent: metrics.totalSpent?.[0]?.sum || 0,
        avgPerBooking: Math.round(metrics.avgPerBooking?.[0]?.avg || 0),
      },
      paymentMethods: metrics.paymentMethods || [],
      topRoutes: metrics.topRoutes || [],
    },
    security: {
      failedLoginAttempts: user.failedLoginAttempts || 0,
      accountLocked: user.lockedUntil ? user.lockedUntil > now() : false,
      lockedUntil: user.lockedUntil || null,
      forcePasswordChange: user.forcePasswordChange || false,
      activeSessions: sessionCount,
      lastLoginAt: user.lastLoginAt || null,
      softDeleted: !!user.deletedAt,
      deletedAt: user.deletedAt || null,
      suspensionReason: user.suspensionReason || null,
      suspendedAt: user.suspendedAt || null,
    },
    referral: {
      code: user.referralCode || null,
      totalReferrals: user.totalReferrals || 0,
      referredBy: user.referredBy || null,
    },
    auditLog,
  };
}

function createUserProfileController({
  repository,
  isValidObjectId,
  now = () => new Date(),
  logger = console,
}) {
  return async function getUserById(req, res) {
    try {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ success: false, message: "Id is required!" });
      }
      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format!",
        });
      }
      const [user, metrics, auditLog, sessionCount] =
        await repository.getProfileContext(id);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found!" });
      }
      return res.status(200).json({
        success: true,
        message: "User profile retrieved successfully!",
        data: mapUserProfile(user, metrics, auditLog, sessionCount, now),
      });
    } catch (error) {
      logger.error("getUserById error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error!",
      });
    }
  };
}

module.exports = { createUserProfileController, mapUserProfile };
