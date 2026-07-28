"use strict";

function createPasswordResetController({
  User,
  bcrypt,
  isValidObjectId,
  support,
  logger = console,
}) {
  return async function changeUserPassword(req, res) {
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
      if (!isValidObjectId(id)) {
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
        return res.status(404).json({ success: false, message: "User not found!" });
      }
      if (user.deletedAt) {
        return res.status(400).json({
          success: false,
          message: "Cannot change password for a deleted account.",
        });
      }
      user.password = await bcrypt.hash(password, 12);
      user.forcePasswordChange = true;
      await user.save();
      await support.revokeUserSessions(id);
      await support.logAdminAction(
        req.adminInfo.id,
        "FORCE_PASSWORD_RESET",
        "user",
        id,
        "Admin reset user password",
        {}
      );
      return res.status(200).json({
        success: true,
        message:
          "Password updated successfully! User will be required to set a new password on next login.",
      });
    } catch (error) {
      logger.error("changeUserPassword error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error!",
      });
    }
  };
}

module.exports = { createPasswordResetController };
