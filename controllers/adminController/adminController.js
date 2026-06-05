/**
 * adminController.js — User Management Operations
 *
 * Admin role: Observer + Enforcer
 *   - View user profiles with enriched metrics
 *   - Enforce actions: ban, suspend, reactivate, force password reset
 *   - Soft-delete with safety checks
 *
 * Admin is NOT an editor — users manage their own profile data
 * through the passenger app.
 */

const User = require("../../models/userModel.js");
const Booking = require("../../models/bookTicketModel.js");
const AdminAuditLog = require("../../models/adminAuditLogModel.js");
const RefreshToken = require("../../models/refreshTokenModel.js");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Revoke all active sessions for a user by deleting their refresh tokens.
 * This forces immediate logout on all devices on next token refresh attempt.
 */
const revokeUserSessions = async (userId) => {
  return RefreshToken.deleteMany({ userId });
};

/**
 * Send a push notification to a specific user via their registered devices.
 * Fails silently — enforcement action must not be blocked by notification failure.
 */
const sendUserNotification = async (userId, title, description) => {
  try {
    const UserDeviceInfo = require("../../models/userDeviceInfoModel.js");
    const {
      notificationManager,
      createLocalNotification,
    } = require("../notificationController/notification_manager.js");

    const devices = await UserDeviceInfo.find({ userId });
    const tokens = devices.map((d) => d.token).filter(Boolean);

    // Always create local notification (visible in app notification center)
    await createLocalNotification(userId, "ACCOUNT_ACTION", title, description, {});

    // Send push notification if device tokens exist
    if (tokens.length > 0) {
      await notificationManager(tokens, title, description);
    }
  } catch (err) {
    // Log but don't throw — notification failure must not block the admin action
    console.error(`[AdminController] Failed to notify user ${userId}:`, err.message);
  }
};

/**
 * Log an admin action to the immutable audit trail.
 */
const logAdminAction = async (adminId, action, targetType, targetId, reason, metadata = {}) => {
  try {
    await AdminAuditLog.create({
      adminId,
      action,
      targetType,
      targetId,
      reason,
      metadata,
    });
  } catch (err) {
    // Audit log failure is serious but must not block the primary operation
    console.error("[AdminController] Audit log write failed:", err.message);
  }
};

// ─── ADMIN CHANGE USER PASSWORD ───────────────────────────────────────────────

const changeUserPassword = async (req, res) => {
  try {
    const { id, password, confirmPassword } = req.body;

    if (!id || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: !id
          ? "Id is required!"
          : !password
            ? "Password is required!"
            : "Confirm password is required!",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format!",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Password and confirm password do not match!",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long!",
      });
    }

    const user = await User.findById(id).select("+password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    // Soft-deleted users can't have their password changed
    if (user.deletedAt) {
      return res.status(400).json({
        success: false,
        message: "Cannot change password for a deleted account.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    user.password = hashedPassword;
    user.forcePasswordChange = true; // Require user to set their own password on next login
    await user.save();

    // Revoke all sessions — force re-login with new password
    await revokeUserSessions(id);

    // Audit log
    await logAdminAction(
      req.adminInfo.id,
      "FORCE_PASSWORD_RESET",
      "user",
      id,
      "Admin reset user password",
      {}
    );

    return res.status(200).json({
      success: true,
      message: "Password updated successfully! User will be required to set a new password on next login.",
    });
  } catch (error) {
    console.error("changeUserPassword error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// ─── SOFT DELETE ACCOUNT ──────────────────────────────────────────────────────

const deleteAccount = async (req, res) => {
  try {
    const { id, reason } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Id is required!",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format!",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    // Already soft-deleted
    if (user.deletedAt) {
      return res.status(400).json({
        success: false,
        message: "This account has already been deleted.",
      });
    }

    // Safety check: deny deletion if user has upcoming/active bookings
    const activeBookings = await Booking.countDocuments({
      userId: user._id,
      status: "booked",
      bookedAt: { $gte: new Date() },
    });

    if (activeBookings > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete account: user has ${activeBookings} active/upcoming booking(s). Cancel them first.`,
      });
    }

    // Soft-delete: mark as deleted + deactivate, preserve all data
    user.deletedAt = new Date();
    user.status = "inactive";
    await user.save();

    // Revoke all sessions — immediate logout
    await revokeUserSessions(id);

    // Notify user
    await sendUserNotification(
      id,
      "Account Deactivated",
      "Your ShuV Marg account has been deactivated by admin. If you believe this is an error, please contact support at support@shuvmarg.com."
    );

    // Audit log
    await logAdminAction(
      req.adminInfo.id,
      "SOFT_DELETE",
      "user",
      id,
      reason || "No reason provided",
      { previousStatus: user.status }
    );

    return res.status(200).json({
      success: true,
      message: "Account deactivated successfully. User data has been preserved.",
    });
  } catch (error) {
    console.error("deleteAccount error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// ─── GET USER BY ID (ENRICHED PROFILE) ────────────────────────────────────────

const getUserById = async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Id is required!",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format!",
      });
    }

    const userObjectId = new mongoose.Types.ObjectId(id);

    // ── Parallel data fetch — single round of DB queries ──
    const [user, bookingMetrics, recentAuditActions, sessionCount] = await Promise.all([
      // 1. User document (exclude sensitive fields)
      User.findById(id)
        .select("-password -otp -otpExpiry -__v")
        .populate("referredBy", "name phone referralCode")
        .lean(),

      // 2. Booking metrics aggregation
      Booking.aggregate([
        { $match: { userId: userObjectId } },
        {
          $facet: {
            total: [{ $count: "count" }],
            completed: [
              { $match: { status: "booked" } },
              { $count: "count" },
            ],
            cancelled: [
              { $match: { status: "cancelled" } },
              { $count: "count" },
            ],
            totalSpent: [
              { $match: { status: "booked" } },
              { $group: { _id: null, sum: { $sum: "$totalAmount" } } },
            ],
            avgPerBooking: [
              { $match: { status: "booked" } },
              { $group: { _id: null, avg: { $avg: "$totalAmount" } } },
            ],
            paymentMethods: [
              { $group: { _id: "$paymentMethod", count: { $sum: 1 } } },
              { $sort: { count: -1 } },
            ],
            topRoutes: [
              {
                $lookup: {
                  from: "trips",
                  localField: "tripId",
                  foreignField: "_id",
                  as: "trip",
                },
              },
              { $unwind: { path: "$trip", preserveNullAndEmptyArrays: true } },
              {
                $lookup: {
                  from: "routes",
                  localField: "trip.routeId",
                  foreignField: "_id",
                  as: "route",
                },
              },
              { $unwind: { path: "$route", preserveNullAndEmptyArrays: true } },
              {
                $group: {
                  _id: "$trip.routeId",
                  from: { $first: "$route.from" },
                  to: { $first: "$route.to" },
                  count: { $sum: 1 },
                },
              },
              { $sort: { count: -1 } },
              { $limit: 5 },
            ],
          },
        },
      ]),

      // 3. Recent admin actions on this user (last 20)
      AdminAuditLog.find({ targetId: userObjectId })
        .sort({ createdAt: -1 })
        .limit(20)
        .populate("adminId", "email role")
        .lean(),

      // 4. Active session count
      RefreshToken.countDocuments({ userId: userObjectId }),
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    // Extract aggregation results
    const metrics = bookingMetrics[0] || {};

    const enrichedResponse = {
      // Profile data (read-only for admin)
      profile: user,

      // Booking metrics
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

      // Security posture
      security: {
        failedLoginAttempts: user.failedLoginAttempts || 0,
        accountLocked: user.lockedUntil ? user.lockedUntil > new Date() : false,
        lockedUntil: user.lockedUntil || null,
        forcePasswordChange: user.forcePasswordChange || false,
        activeSessions: sessionCount,
        lastLoginAt: user.lastLoginAt || null,
        softDeleted: !!user.deletedAt,
        deletedAt: user.deletedAt || null,
        suspensionReason: user.suspensionReason || null,
        suspendedAt: user.suspendedAt || null,
      },

      // Referral data
      referral: {
        code: user.referralCode || null,
        totalReferrals: user.totalReferrals || 0,
        referredBy: user.referredBy || null,
      },

      // Admin audit trail
      auditLog: recentAuditActions,
    };

    return res.status(200).json({
      success: true,
      message: "User profile retrieved successfully!",
      data: enrichedResponse,
    });
  } catch (error) {
    console.error("getUserById error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// ─── GET ALL USERS (WITH REAL BOOKING COUNTS) ─────────────────────────────────

const getAllUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
    const search = (req.query.search || "").trim();
    const statusFilter = (req.query.status || "").trim().toLowerCase();

    const skip = (page - 1) * limit;

    // Build query — always exclude soft-deleted users
    const query = {
      roles: "passenger",
      deletedAt: null,
    };

    // Status filter
    if (statusFilter && ["active", "inactive", "banned"].includes(statusFilter)) {
      query.status = statusFilter;
    }

    // Server-side search across name, phone, email
    if (search) {
      // Escape regex special characters to prevent injection
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { phone: { $regex: escaped, $options: "i" } },
        { email: { $regex: escaped, $options: "i" } },
      ];
    }

    // Fetch users + total count in parallel
    const [users, totalCount, bookingCounts] = await Promise.all([
      User.find(query)
        .select("name email phone address gender role roles status profilePicture referralCode totalReferrals isVerified lastLoginAt createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      User.countDocuments(query),

      // Aggregate booking counts for all passengers (matching current filter)
      // This gives us per-user booking count and total spent
      Booking.aggregate([
        { $match: { status: "booked" } },
        {
          $group: {
            _id: "$userId",
            bookingCount: { $sum: 1 },
            totalSpent: { $sum: "$totalAmount" },
          },
        },
      ]),
    ]);

    // Build a lookup map: userId -> { bookingCount, totalSpent }
    const bookingMap = {};
    for (const b of bookingCounts) {
      bookingMap[b._id.toString()] = {
        bookingCount: b.bookingCount,
        totalSpent: b.totalSpent,
      };
    }

    const formattedUsers = users.map((user) => {
      const stats = bookingMap[user._id.toString()] || { bookingCount: 0, totalSpent: 0 };
      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        gender: user.gender,
        role: user.role,
        roles: user.roles,
        status: user.status,
        profilePicture: user.profilePicture,
        referralCode: user.referralCode,
        totalReferrals: user.totalReferrals,
        isVerified: user.isVerified,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        bookingCount: stats.bookingCount,
        totalSpent: stats.totalSpent,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Users retrieved successfully!",
      data: formattedUsers,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: page * limit < totalCount,
      },
    });
  } catch (error) {
    console.error("getAllUsers error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// ─── UPDATE USER STATUS (BAN / SUSPEND / REACTIVATE) ──────────────────────────

const updateUserStatus = async (req, res) => {
  try {
    const { id, status, reason } = req.body;

    if (!id || !status) {
      return res.status(400).json({
        success: false,
        message: !id ? "Id is required!" : "Status is required!",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format!",
      });
    }

    const allowedStatuses = ["active", "inactive", "banned"];
    const normalizedStatus = String(status).toLowerCase();

    if (!allowedStatuses.includes(normalizedStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value. Allowed values are: active, inactive, banned",
      });
    }

    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found!",
      });
    }

    // Soft-deleted users can only be managed through the delete endpoint
    if (user.deletedAt) {
      return res.status(400).json({
        success: false,
        message: "Cannot change status of a deleted account.",
      });
    }

    const previousStatus = user.status;

    // Determine audit action type
    let auditAction = "STATUS_CHANGE";
    if (normalizedStatus === "banned") auditAction = "BAN";
    else if (normalizedStatus === "inactive") auditAction = "SUSPEND";
    else if (normalizedStatus === "active" && ["banned", "inactive"].includes(previousStatus)) {
      auditAction = "REACTIVATE";
    }

    // Update user status
    user.status = normalizedStatus;

    // For ban/suspend: store reason and timestamp
    if (normalizedStatus === "banned" || normalizedStatus === "inactive") {
      user.suspensionReason = reason || null;
      user.suspendedAt = new Date();
      user.statusChangedBy = req.adminInfo.id;

      // Revoke all active sessions — immediate forced logout
      await revokeUserSessions(id);

      // Send push notification to the user
      const actionLabel = normalizedStatus === "banned" ? "Banned" : "Suspended";
      const reasonText = reason
        ? `Reason: ${reason}`
        : "No specific reason was provided.";

      await sendUserNotification(
        id,
        `Account ${actionLabel}`,
        `Your ShuV Marg account has been ${actionLabel.toLowerCase()}. ${reasonText} If you believe this is an error, please contact support at support@shuvmarg.com or call +977-9800000000.`
      );
    }

    // For reactivation: clear suspension data
    if (normalizedStatus === "active") {
      user.suspensionReason = null;
      user.suspendedAt = null;
      user.statusChangedBy = null;

      // Notify user of reactivation
      await sendUserNotification(
        id,
        "Account Reactivated",
        "Your ShuV Marg account has been reactivated. You can now log in and use all services. Welcome back!"
      );
    }

    await user.save();

    // Audit log
    await logAdminAction(
      req.adminInfo.id,
      auditAction,
      "user",
      id,
      reason || null,
      { previousStatus, newStatus: normalizedStatus }
    );

    return res.status(200).json({
      success: true,
      message: `User status updated to '${normalizedStatus}' successfully!`,
      data: {
        id: user._id,
        status: user.status,
        previousStatus,
      },
    });
  } catch (error) {
    console.error("updateUserStatus error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// ─── GET USER TRANSACTIONS ────────────────────────────────────────────────────

const getUserTransactions = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Valid user ID is required!",
      });
    }

    const Transaction = require("../../models/transactionModel.js");

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [transactions, totalCount] = await Promise.all([
      Transaction.find({ userId: id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("bookingId", "ticketId seats totalAmount status paymentMethod bookedAt")
        .lean(),

      Transaction.countDocuments({ userId: id }),
    ]);

    return res.status(200).json({
      success: true,
      message: "User transactions retrieved successfully!",
      data: transactions,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error("getUserTransactions error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

// ─── GET USER DASHBOARD STATS ─────────────────────────────────────────────────
// NOTE: The primary dashboard endpoint is in userDashboardController.js
// This is REMOVED to avoid duplication. Use the route at /userDashboard instead.

module.exports = {
  changeUserPassword,
  deleteAccount,
  getUserById,
  getAllUsers,
  updateUserStatus,
  getUserTransactions,
};
