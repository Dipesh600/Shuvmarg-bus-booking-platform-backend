"use strict";

function createUserManagementSupportService({
  RefreshToken,
  AdminAuditLog,
  UserDeviceInfo,
  notificationManager,
  createLocalNotification,
  logger = console,
}) {
  const revokeUserSessions = (userId) => RefreshToken.deleteMany({ userId });

  async function sendUserNotification(userId, title, description) {
    try {
      const devices = await UserDeviceInfo.find({ userId });
      const tokens = devices.map((device) => device.token).filter(Boolean);
      await createLocalNotification(
        userId,
        "ACCOUNT_ACTION",
        title,
        description,
        {}
      );
      if (tokens.length > 0) {
        await notificationManager(tokens, title, description);
      }
    } catch (error) {
      logger.error(
        `[AdminController] Failed to notify user ${userId}:`,
        error.message
      );
    }
  }

  async function logAdminAction(
    adminId,
    action,
    targetType,
    targetId,
    reason,
    metadata = {}
  ) {
    try {
      await AdminAuditLog.create({
        adminId,
        action,
        targetType,
        targetId,
        reason,
        metadata,
      });
    } catch (error) {
      logger.error("[AdminController] Audit log write failed:", error.message);
    }
  }

  return { revokeUserSessions, sendUserNotification, logAdminAction };
}

module.exports = { createUserManagementSupportService };
