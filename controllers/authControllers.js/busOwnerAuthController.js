/**
 * controllers/authControllers.js/busOwnerAuthController.js
 *
 * Self-registration and authentication flow for bus owners on the web portal.
 *
 * MULTI-ROLE IDENTITY SYSTEM:
 *   - One phone = one User = many roles.
 *   - "Find-or-Upgrade": adds "busOwner" role to an existing user OR creates new user.
 *   - Bus-owner-specific approval lives on BusOwner.verificationStatus, NOT User.status.
 *   - OTP is always required to prove phone ownership.
 *
 * Endpoints:
 *   POST /api/auth/busowner/sendOTP    — Step 1: send verification OTP
 *   POST /api/auth/busowner/verifyOTP  — Step 2: verify OTP
 *   POST /api/auth/busowner/register   — Step 3: create / upgrade account
 *   POST /api/auth/busowner/resendOTP  — Resend OTP (rate-limited)
 *   POST /api/auth/busowner/login      — Login with phone + password
 *
 * Login uses a dedicated bus-owner endpoint to:
 *   1. Normalize phone before lookup
 *   2. Enforce the busOwner role (reject non-operators)
 *   3. Apply a login-specific rate limiter
 */

"use strict";

const User = require("../../models/userModel.js");
const BusOwner = require("../../models/busOwnerModel.js");
const PartnerLead = require("../../models/PartnerLead.js");
const bcrypt = require("bcryptjs");
const { normalizePhone, checkPhoneForRole } = require("../../utils/phoneGuard.js");
const { createAndSendOTP, verifyOTPCode } = require("../../utils/otpHelper.js");
const { validatePassword } = require("../../utils/passwordValidator.js");
const { generateTokenPair, revokeAllUserTokens } = require("../../utils/tokenService.js");
const { otpFirstVerify, withMinimumLatency } = require("../../utils/enumGuard.js");
const { issueVerificationToken, validateVerificationToken } = require("../../utils/verificationToken.js");

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

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /api/auth/busowner/sendOTP
 *
 * Send OTP for bus owner self-registration.
 * Blocks only if the phone already has the "busOwner" role.
 * Allows existing passengers/agents to upgrade (add busOwner role).
 */
const sendOTP = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);

    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number is required." });
    }

    // Validate Nepal mobile number format (10 digits starting with 97 or 98)
    if (!/^(97|98)\d{8}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid Nepal mobile number.",
      });
    }

    // Role-aware phone check — only block if already a busOwner
    const { exists, hasRole, user } = await checkPhoneForRole(phone, "busOwner");

    if (exists && hasRole) {
      // ENUMERATION DEFENCE: do NOT return 409 ROLE_ALREADY_REGISTERED.
      // A distinct error code tells an attacker this phone is a registered bus operator.
      // Return the same neutral 200 as the success path. OTP is not sent.
      // The real gate is at /register, which requires a valid consumed OTP.
      return res.status(200).json({
        success: true,
        message: "If this number is eligible, a verification code has been sent.",
      });
    }

    if (exists && user && (user.status === "banned" || user.status === "inactive")) {
      // ENUMERATION DEFENCE: do NOT return 403 ACCOUNT_SUSPENDED.
      // Same neutral 200 — the banned account will be rejected at /register.
      return res.status(200).json({
        success: true,
        message: "If this number is eligible, a verification code has been sent.",
      });
    }

    await createAndSendOTP(phone, "BUSOWNER_REGISTRATION");

    return res.status(200).json({
      success: true,
      message: "If this number is eligible, a verification code has been sent.",
    });
  } catch (error) {
    if (handleOtpSendBlockedError(error, res)) return;
    console.error("[BusOwner sendOTP] Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to send verification code. Please try again." });
  }
};

/**
 * POST /api/auth/busowner/verifyOTP
 *
 * Verify OTP for bus owner self-registration.
 * Returns whether the phone belongs to an existing user (for upgrade UX).
 * Side-effect: upserts an otp_verified PartnerLead so the lead is captured
 * even if the user abandons registration after this step.
 */
const verifyOTP = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const { otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: "Phone number and verification code are required." });
    }

    // Sanitize OTP input — digits only
    const cleanOtp = String(otp).replace(/\D/g, "");
    if (cleanOtp.length !== 6) {
      return res.status(400).json({ success: false, message: "Verification code must be 6 digits." });
    }

    const result = await verifyOTPCode(phone, cleanOtp, "BUSOWNER_REGISTRATION");
    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.error });
    }

    // Race-condition guard — check role wasn't added between sendOTP and verifyOTP
    const { exists, hasRole, user } = await checkPhoneForRole(phone, "busOwner");
    if (exists && hasRole) {
      return res.status(409).json({
        success: false,
        message: "This mobile number is already registered as a bus operator.",
        errorCode: "ROLE_ALREADY_REGISTERED",
      });
    }

    // ── Capture as otp_verified busOwner lead (fire-and-forget) ──────────────
    // Upsert so we don't overwrite a contact_form lead that already exists for
    // this phone — we create a separate otp_verified record instead.
    PartnerLead.findOneAndUpdate(
      { phone, leadType: "otp_verified", entityType: "busOwner" },
      {
        phone,
        leadType: "otp_verified",
        entityType: "busOwner",
        phoneVerified: true,
        source: "busowner_app",
        $setOnInsert: { status: "new" },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).catch((err) => console.error("[PartnerLead upsert - verifyOTP] Non-fatal:", err.message));
    // ─────────────────────────────────────────────────────────────────────────

    // Issue a signed verification token bound to this phone and purpose.
    // The client MUST include this token in the registration request (Step 3).
    // Without it, no other requester can complete registration for this phone
    // even though the OTP record is now marked isUsed:true in MongoDB.
    const verificationToken = issueVerificationToken(phone, "BUSOWNER_REGISTRATION");

    return res.status(200).json({
      success: true,
      message: exists
        ? "Phone verified. Existing account found — complete your operator setup."
        : "Phone verified successfully. Complete your registration.",
      exists,
      userName: exists && user ? user.name : null,
      verificationToken,
    });
  } catch (error) {
    console.error("[BusOwner verifyOTP] Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to verify code. Please try again." });
  }
};

/**
 * POST /api/auth/busowner/register
 *
 * Complete bus owner self-registration using the "Find-or-Upgrade" pattern.
 *
 * Scenarios:
 *   a. Phone NOT in DB → create new User + BusOwner profile
 *   b. Phone exists, already has "busOwner" role → reject (race condition)
 *   c. Phone exists, different role → add "busOwner" to roles[], create BusOwner profile
 */
const register = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const { name, password, email, companyName, address } = req.body;

    // Required field validation
    if (!phone || !name || !companyName) {
      const missing = !phone ? "Phone" : !name ? "Name" : "Company name";
      return res.status(400).json({ success: false, message: `${missing} is required.` });
    }

    // Sanitize name (min 3 chars)
    if (name.trim().length < 3) {
      return res.status(400).json({ success: false, message: "Name must be at least 3 characters." });
    }

    // Sanitize company name
    if (companyName.trim().length < 3) {
      return res.status(400).json({ success: false, message: "Company name must be at least 3 characters." });
    }

    // AUTH-01.02: Validate verification token — proves this HTTP client was the one
    // that successfully verified the OTP (Step 2). A second requester who knows only
    // the phone number cannot complete registration without this signed token.
    const { verificationToken } = req.body;
    const tokenResult = validateVerificationToken(verificationToken, phone, "BUSOWNER_REGISTRATION");
    if (!tokenResult.valid) {
      return res.status(400).json({
        success: false,
        message: tokenResult.error,
      });
    }

    // Belt-and-suspenders: Verify OTP was completed
    const OTP = require("../../models/otpModel.js");
    const otpRecord = await OTP.findOne({ phone, purpose: "BUSOWNER_REGISTRATION", isUsed: true });
    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "Phone not verified. Please complete OTP verification first.",
      });
    }

    // OTP verification must be recent (30-minute window)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    if (otpRecord.updatedAt < thirtyMinutesAgo) {
      return res.status(400).json({
        success: false,
        message: "OTP verification has expired. Please verify your phone again.",
      });
    }

    // === FIND-OR-UPGRADE ===
    const { exists, hasRole, user: existingUser } = await checkPhoneForRole(phone, "busOwner");

    if (exists && hasRole) {
      return res.status(409).json({
        success: false,
        message: "This mobile number is already registered as a bus operator.",
        errorCode: "ROLE_ALREADY_REGISTERED",
      });
    }

    let savedUser;

    if (exists && existingUser) {
      // === UPGRADE PATH: Existing user → add "busOwner" role ===
      savedUser = await User.findByIdAndUpdate(
        existingUser._id,
        {
          $addToSet: { roles: "busOwner" },
          $set: { "roleActivatedAt.busOwner": new Date() },
        },
        { new: true }
      );
    } else {
      // === NEW USER PATH ===
      if (!password) {
        return res.status(400).json({ success: false, message: "Password is required for new registration." });
      }

      const passwordCheck = validatePassword(password);
      if (!passwordCheck.valid) {
        return res.status(400).json({
          success: false,
          message: passwordCheck.errors[0],
          errors: passwordCheck.errors,
        });
      }

      // Email uniqueness check (only if provided)
      if (email) {
        const normalizedEmail = email.toLowerCase().trim();
        const emailExists = await User.findOne({ email: normalizedEmail });
        if (emailExists) {
          return res.status(409).json({ success: false, message: "This email address is already registered." });
        }
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      const userData = {
        name: name.trim(),
        phone,
        password: hashedPassword,
        role: "busOwner",
        roles: ["busOwner"],
        status: "active",       // Approval lives on BusOwner.verificationStatus, NOT User.status
        phoneVerified: true,
        isVerified: false,
        roleActivatedAt: { busOwner: new Date() },
      };
      if (email) userData.email = email.toLowerCase().trim();
      if (address) userData.address = address.trim();

      const newUser = new User(userData);
      savedUser = await newUser.save();
    }

    // Create BusOwner KYC skeleton (always created for a new busOwner role)
    const existingBusOwner = await BusOwner.findOne({ user: savedUser._id });
    if (!existingBusOwner) {
      const newBusOwner = new BusOwner({
        user: savedUser._id,
        companyName: companyName.trim(),
        verificationStatus: "pending",
      });
      await newBusOwner.save();
    }

    // Issue tokens with activeRole: "busOwner"
    const { accessToken, refreshToken } = await generateTokenPair(savedUser, {
      deviceInfo: req.get("User-Agent") || null,
      ipAddress: req.ip || req.socket?.remoteAddress || null,
      activeRole: "busOwner",
    });

    const userObj = savedUser.toObject ? savedUser.toObject() : { ...savedUser };
    delete userObj.password;

    // ── Mark any otp_verified busOwner lead as converted (fire-and-forget) ────
    const normalizedPhone = normalizePhone(savedUser.phone || phone);
    if (normalizedPhone) {
      PartnerLead.updateMany(
        { phone: normalizedPhone, leadType: "otp_verified", entityType: "busOwner" },
        { $set: { status: "converted" } }
      ).catch((err) => console.error("[PartnerLead convert - register] Non-fatal:", err.message));
    }
    // ─────────────────────────────────────────────────────────────────────────

    const responseData = {
      success: true,
      message: exists
        ? "Bus operator role added. Submit your KYC documents to activate your account."
        : "Registration successful. Submit your KYC documents to activate your account.",
      user: userObj,
      accessToken,
      activeRole: "busOwner",
      isUpgrade: !!exists,
    };
    // Refresh token delivered via httpOnly cookie only — not in response body (FINDING-06)
    if (refreshToken) {
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }

    return res.status(201).json(responseData);
  } catch (error) {
    console.error("[BusOwner register] Error:", error.message);

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      return res.status(409).json({
        success: false,
        message: `${field === "phone" ? "Mobile number" : field === "email" ? "Email" : "Value"} is already registered.`,
      });
    }

    return res.status(500).json({ success: false, message: "Registration failed. Please try again." });
  }
};

/**
 * POST /api/auth/busowner/resendOTP
 *
 * Resend OTP for bus owner registration.
 * Rate-limited via blockedUntil in the OTP document (max 3 sends per 10 min).
 */
const resendOTP = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);

    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number is required." });
    }

    // Only resend if not already a bus owner (don't allow fishing for existing accounts)
    const { exists, hasRole } = await checkPhoneForRole(phone, "busOwner");
    if (exists && hasRole) {
      return res.status(409).json({
        success: false,
        message: "This mobile number is already registered as a bus operator.",
        errorCode: "ROLE_ALREADY_REGISTERED",
      });
    }

    const result = await createAndSendOTP(phone, "BUSOWNER_REGISTRATION");

    return res.status(200).json({
      success: true,
      message: "New verification code sent.",
      data: { expiresIn: result.expiresIn },
    });
  } catch (error) {
    if (handleOtpSendBlockedError(error, res)) return;
    console.error("[BusOwner resendOTP] Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to resend code. Please try again." });
  }
};

/**
 * POST /api/auth/busowner/requestPasswordReset
 */
const requestPasswordReset = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number is required." });
    }

    // ENUMERATION DEFENCE: always respond 200 with the same body whether
    // or not the account exists or has the busOwner role.
    // OTP is only dispatched for valid, active busOwner accounts.
    await withMinimumLatency(async () => {
      const user = await User.findOne({ phone });
      if (!user) return;
      const { hasRole } = await checkPhoneForRole(phone, "busOwner");
      if (!hasRole) return;
      await createAndSendOTP(user.phone, "BUSOWNER_PASSWORD_RESET");
    }, 600);

    return res.status(200).json({
      success: true,
      message: "If an account exists, OTP has been sent.",
    });
  } catch (error) {
    if (handleOtpSendBlockedError(error, res)) return;
    console.error("[BusOwner requestPasswordReset] Error:", error.message);
    if (error.message && error.message.includes('Sparrow SMS')) {
      return res.status(502).json({ success: false, message: "SMS gateway error. Please try again." });
    }
    return res.status(500).json({ success: false, message: "Failed to send OTP. Please try again." });
  }
};

/**
 * POST /api/auth/busowner/verifyOtpForReset
 */
const verifyOtpForReset = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const { otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: "Phone and OTP are required!" });
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
      "BUSOWNER_PASSWORD_RESET",
      false, // peek only — resetPassword will consume
      verifyOTPCode,
      (p) => User.findOne({ phone: p })
    );

    if (!valid) {
      return res.status(400).json({ success: false, message: error });
    }

    // Post-OTP role check: the user exists (OTP proved it) but may not have busOwner role.
    // Using `user` from otpFirstVerify — no extra DB round-trip.
    const roles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
    if (!roles.includes("busOwner")) {
      // Return the same generic error — don't reveal the role mismatch.
      return res.status(400).json({ success: false, message: "Invalid or expired verification code." });
    }

    return res.status(200).json({
      success: true,
      message: "OTP verified. Proceed to reset password.",
    });
  } catch (error) {
    console.error("[BusOwner verifyOtpForReset] Error:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * POST /api/auth/busowner/resetPassword
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

    const { hasRole } = await checkPhoneForRole(phone, "busOwner");
    if (!hasRole) {
      return res.status(400).json({ success: false, message: "Invalid OTP or phone number." });
    }

    // Verify AND mark as used
    const result = await verifyOTPCode(user.phone, cleanOtp, "BUSOWNER_PASSWORD_RESET", true);
    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.error });
    }

    const passValidation = validatePassword(newPassword);
    if (!passValidation.valid) {
      return res.status(400).json({ success: false, message: passValidation.message });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    
    // Auto-verify if not verified (since they successfully got OTP)
    if (!user.isVerified) user.isVerified = true;

    // Reset lock status
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
      message: "Password reset successful! You can now login.",
    });
  } catch (error) {
    console.error("[BusOwner resetPassword] Error:", error.message);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/**
 * POST /api/auth/busowner/resendOtpForReset
 *
 * Resend OTP specifically for the password reset flow.
 * Unlike resendOTP (registration), this:
 *   - Requires the phone to belong to an existing busOwner
 *   - Uses the BUSOWNER_PASSWORD_RESET purpose
 *   - Returns a vague response for non-existent accounts (anti-enumeration)
 */
const resendOtpForReset = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);

    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number is required." });
    }

    // Vague response for non-existent accounts (anti-enumeration)
    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(200).json({ success: true, message: "If an account exists, a new code has been sent." });
    }

    const { hasRole } = await checkPhoneForRole(phone, "busOwner");
    if (!hasRole) {
      return res.status(200).json({ success: true, message: "If an account exists, a new code has been sent." });
    }

    // Ban / suspension check
    if (user.status === "banned" || user.status === "inactive") {
      return res.status(403).json({
        success: false,
        message: "This account has been suspended. Please contact support.",
        errorCode: "ACCOUNT_SUSPENDED",
      });
    }

    const result = await createAndSendOTP(phone, "BUSOWNER_PASSWORD_RESET");

    return res.status(200).json({
      success: true,
      message: "New verification code sent.",
      data: { expiresIn: result.expiresIn },
    });
  } catch (error) {
    if (handleOtpSendBlockedError(error, res)) return;
    console.error("[BusOwner resendOtpForReset] Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to resend code. Please try again." });
  }
};

module.exports = {
  sendOTP,
  verifyOTP,
  register,
  resendOTP,
  requestPasswordReset,
  verifyOtpForReset,
  resetPassword,
  resendOtpForReset,
};
