"use strict";

function createAccountDeletionController({
  User,
  Booking,
  isValidObjectId,
  support,
  now = () => new Date(),
  logger = console,
}) {
  return async function deleteAccount(req, res) {
    try {
      const { id, reason } = req.body;
      if (!id) {
        return res.status(400).json({ success: false, message: "Id is required!" });
      }
      if (!isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID format!",
        });
      }
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found!" });
      }
      if (user.deletedAt) {
        return res.status(400).json({
          success: false,
          message: "This account has already been deleted.",
        });
      }
      const activeBookings = await Booking.countDocuments({
        userId: user._id,
        status: "booked",
        bookedAt: { $gte: now() },
      });
      if (activeBookings > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete account: user has ${activeBookings} active/upcoming booking(s). Cancel them first.`,
        });
      }
      user.deletedAt = now();
      user.status = "inactive";
      await user.save();
      await support.revokeUserSessions(id);
      await support.sendUserNotification(
        id,
        "Account Deactivated",
        "Your ShuV Marg account has been deactivated by admin. If you believe this is an error, please contact support at support@shuvmarg.com."
      );
      await support.logAdminAction(
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
      logger.error("deleteAccount error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error!",
      });
    }
  };
}

module.exports = { createAccountDeletionController };
