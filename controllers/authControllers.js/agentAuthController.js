/**
 * controllers/authControllers.js/agentAuthController.js
 *
 * Self-registration and authentication flow for agents on the partner app.
 *
 * MULTI-ROLE IDENTITY SYSTEM:
 *   - Phone may already exist (e.g., registered as passenger).
 *   - "Find-or-Upgrade" pattern: adds "agent" role to existing user OR creates new user.
 *   - Agent-specific approval lives on Agent.verificationStatus, NOT User.status.
 *   - OTP is always required (proves phone ownership for security).
 *
 * Endpoints:
 *   POST /api/auth/agent/sendOTP              — Step 1: send verification OTP
 *   POST /api/auth/agent/verifyOTP            — Step 2: verify OTP (captures lead)
 *   POST /api/auth/agent/register             — Step 3: create / upgrade account (converts lead)
 *   POST /api/auth/agent/resendOTP            — Resend OTP (rate-limited)
 *   POST /api/auth/agent/login                — Login with phone + password
 *   POST /api/auth/agent/refresh              — Refresh access token
 *   POST /api/auth/agent/logout               — Revoke refresh token
 *   POST /api/auth/agent/requestPasswordReset — Request OTP for password reset
 *   POST /api/auth/agent/verifyOtpForReset    — Verify OTP (password reset)
 *   POST /api/auth/agent/resetPassword        — Set new password
 *   POST /api/auth/agent/resendOtpForReset    — Resend OTP for password reset
 */

"use strict";

const User    = require("../../models/userModel.js");
const bcrypt  = require("bcryptjs");
const { normalizePhone, checkPhoneForRole } = require("../../utils/phoneGuard.js");
const { createAndSendOTP, verifyOTPCode }   = require("../../utils/otpHelper.js");
const { validatePassword }                   = require("../../utils/passwordValidator.js");
const { revokeAllUserTokens } = require("../../utils/tokenService.js");
const { otpFirstVerify, withMinimumLatency } = require("../../utils/enumGuard.js");

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Convert an OTP_SEND_BLOCKED error into a 429 HTTP response.
 * Returns true if it handled the error, false if caller should handle it.
 */
const handleOtpSendBlockedError = (error, res) => {
  if (error.message && error.message.startsWith("OTP_SEND_BLOCKED:")) {
    const minutesLeft = parseInt(error.message.split(":")[1], 10) || 10;
    res.status(429).json({
      success: false,
      message: `Too many OTP requests. Please wait ${minutesLeft} minute(s) before trying again.`,
      errorCode: "OTP_SEND_BLOCKED",
      retryAfterMinutes: minutesLeft,
    });
    return true;
  }
  return false;
};

// ── Password Reset Flow ───────────────────────────────────────────────────────

/**
 * POST /api/auth/agent/requestPasswordReset
 *
 * Sends a password-reset OTP to the registered phone.
 * Returns a vague success response for non-existent accounts (anti-enumeration).
 */
const requestPasswordReset = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number is required." });
    }

    // ENUMERATION DEFENCE: always respond 200 with the same body whether
    // or not the account exists or has the agent role.
    // OTP is only dispatched for valid, active agent accounts.
    await withMinimumLatency(async () => {
      const user = await User.findOne({ phone });
      if (!user) return;
      const { hasRole } = await checkPhoneForRole(phone, "agent");
      if (!hasRole) return;
      await createAndSendOTP(user.phone, "AGENT_PASSWORD_RESET");
    }, 600);

    return res.status(200).json({
      success: true,
      message: "If an account exists, OTP has been sent.",
    });
  } catch (error) {
    if (handleOtpSendBlockedError(error, res)) return;
    console.error("[Agent requestPasswordReset] Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to send OTP. Please try again." });
  }
};

/**
 * POST /api/auth/agent/verifyOtpForReset
 *
 * Verifies OTP for the password reset flow (does NOT mark OTP as used —
 * that happens in resetPassword so the same OTP is used for both steps).
 */
const verifyOtpForReset = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const { otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: "Phone and OTP are required." });
    }

    const cleanOtp = String(otp).replace(/\D/g, "");
    if (cleanOtp.length !== 6) {
      return res.status(400).json({ success: false, message: "Verification code must be 6 digits." });
    }

    // ENUMERATION DEFENCE (otpFirstVerify): OTP is validated BEFORE the user
    // record is looked up. If the OTP is wrong we stop immediately with a
    // generic error — no DB lookup, no timing difference, no phone enumeration.
    const { valid, user, error } = await otpFirstVerify(
      phone,
      cleanOtp,
      "AGENT_PASSWORD_RESET",
      false, // peek only — resetPassword will consume
      verifyOTPCode,
      (p) => User.findOne({ phone: p })
    );

    if (!valid) {
      return res.status(400).json({ success: false, message: error });
    }

    // Post-OTP role check: the user exists (OTP proved it) but may not have agent role.
    const roles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
    if (!roles.includes("agent")) {
      return res.status(400).json({ success: false, message: "Invalid or expired verification code." });
    }

    return res.status(200).json({
      success: true,
      message: "OTP verified. Proceed to reset password.",
    });
  } catch (error) {
    console.error("[Agent verifyOtpForReset] Error:", error.message);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * POST /api/auth/agent/resetPassword
 *
 * Verifies OTP (marks it used) and sets a new password.
 * Revokes all existing refresh tokens for this user.
 */
const resetPassword = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const { otp, newPassword } = req.body;

    if (!phone || !otp || !newPassword) {
      return res.status(400).json({ success: false, message: "Phone, OTP, and new password are required." });
    }

    const cleanOtp = String(otp).replace(/\D/g, "");
    if (cleanOtp.length !== 6) {
      return res.status(400).json({ success: false, message: "Verification code must be 6 digits." });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid OTP or phone number." });
    }

    const { hasRole } = await checkPhoneForRole(phone, "agent");
    if (!hasRole) {
      return res.status(400).json({ success: false, message: "Invalid OTP or phone number." });
    }

    // Verify AND mark as used (true = consume the OTP)
    const result = await verifyOTPCode(user.phone, cleanOtp, "AGENT_PASSWORD_RESET", true);
    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.error });
    }

    const passValidation = validatePassword(newPassword);
    if (!passValidation.valid) {
      return res.status(400).json({ success: false, message: passValidation.errors?.[0] || passValidation.message });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    if (!user.isVerified) user.isVerified = true;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.forcePasswordChange = false;

    await user.save();
    await revokeAllUserTokens(user._id);

    // Also increment tokenVersion to immediately invalidate any currently live
    // access tokens — they will be rejected by verifyRoleFromDB on next use.
    await User.findByIdAndUpdate(user._id, { $inc: { tokenVersion: 1 } });

    return res.status(200).json({
      success: true,
      message: "Password reset successful. You can now sign in.",
    });
  } catch (error) {
    console.error("[Agent resetPassword] Error:", error.message);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * POST /api/auth/agent/resendOtpForReset
 *
 * Resend OTP specifically for the password reset flow.
 * Returns a vague response for non-existent accounts (anti-enumeration).
 */
const resendOtpForReset = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);

    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number is required." });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(200).json({ success: true, message: "If an account exists, a new code has been sent." });
    }

    const { hasRole } = await checkPhoneForRole(phone, "agent");
    if (!hasRole) {
      return res.status(200).json({ success: true, message: "If an account exists, a new code has been sent." });
    }

    if (user.status === "banned" || user.status === "inactive") {
      return res.status(403).json({
        success: false,
        message: "This account has been suspended. Please contact support.",
        errorCode: "ACCOUNT_SUSPENDED",
      });
    }

    const result = await createAndSendOTP(phone, "AGENT_PASSWORD_RESET");

    return res.status(200).json({
      success: true,
      message: "New verification code sent.",
      data: { expiresIn: result.expiresIn },
    });
  } catch (error) {
    if (handleOtpSendBlockedError(error, res)) return;
    console.error("[Agent resendOtpForReset] Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to resend code. Please try again." });
  }
};

module.exports = {
  requestPasswordReset,
  verifyOtpForReset,
  resetPassword,
  resendOtpForReset,
};
