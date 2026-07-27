"use strict";

function getAuditAction(status, previousStatus) {
  if (status === "banned") return "BAN";
  if (status === "inactive") return "SUSPEND";
  if (status === "active" && ["banned", "inactive"].includes(previousStatus)) {
    return "REACTIVATE";
  }
  return "STATUS_CHANGE";
}

function createUserStatusController({
  User,
  isValidObjectId,
  support,
  now = () => new Date(),
  logger = console,
}) {
  return async function updateUserStatus(req, res) {
    try {
      const { id, status, reason } = req.body;
      if (!id || !status) {
        return res.status(400).json({
          success: false,
          message: !id ? "Id is required!" : "Status is required!",
        });
      }
      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format!",
        });
      }
      const normalizedStatus = String(status).toLowerCase();
      if (!["active", "inactive", "banned"].includes(normalizedStatus)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid status value. Allowed values are: active, inactive, banned",
        });
      }
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found!" });
      }
      if (user.deletedAt) {
        return res.status(400).json({
          success: false,
          message: "Cannot change status of a deleted account.",
        });
      }
      const previousStatus = user.status;
      const auditAction = getAuditAction(normalizedStatus, previousStatus);
      user.status = normalizedStatus;
      if (["banned", "inactive"].includes(normalizedStatus)) {
        user.suspensionReason = reason || null;
        user.suspendedAt = now();
        user.statusChangedBy = req.adminInfo.id;
        await support.revokeUserSessions(id);
        const label = normalizedStatus === "banned" ? "Banned" : "Suspended";
        const reasonText = reason
          ? `Reason: ${reason}`
          : "No specific reason was provided.";
        await support.sendUserNotification(
          id,
          `Account ${label}`,
          `Your ShuV Marg account has been ${label.toLowerCase()}. ${reasonText} If you believe this is an error, please contact support at support@shuvmarg.com or call +977-9800000000.`
        );
      }
      if (normalizedStatus === "active") {
        user.suspensionReason = null;
        user.suspendedAt = null;
        user.statusChangedBy = null;
        await support.sendUserNotification(
          id,
          "Account Reactivated",
          "Your ShuV Marg account has been reactivated. You can now log in and use all services. Welcome back!"
        );
      }
      await user.save();
      await support.logAdminAction(
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
        data: { id: user._id, status: user.status, previousStatus },
      });
    } catch (error) {
      logger.error("updateUserStatus error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error!",
      });
    }
  };
}

module.exports = { createUserStatusController, getAuditAction };
