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
const { generateTokenPair, rotateRefreshToken, revokeRefreshToken, revokeAllUserTokens } = require("../../utils/tokenService.js");

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
      return res.status(409).json({
        success: false,
        message: "This mobile number is already registered as a bus operator.",
        errorCode: "ROLE_ALREADY_REGISTERED",
      });
    }

    // Block banned or deactivated accounts
    if (exists && user && (user.status === "banned" || user.status === "inactive")) {
      return res.status(403).json({
        success: false,
        message: "This account has been suspended. Please contact support.",
        errorCode: "ACCOUNT_SUSPENDED",
      });
    }

    const result = await createAndSendOTP(phone, "BUSOWNER_REGISTRATION");

    return res.status(200).json({
      success: true,
      message: "Verification code sent successfully.",
      data: { phone, expiresIn: result.expiresIn },
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

    // ── Capture as otp_verified lead (fire-and-forget) ────────────────────────
    // Upsert so we don't overwrite a contact_form lead that already exists for
    // this phone — we create a separate otp_verified record instead.
    PartnerLead.findOneAndUpdate(
      { phone, leadType: "otp_verified" },
      {
        phone,
        leadType: "otp_verified",
        phoneVerified: true,
        $setOnInsert: { status: "new" },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).catch((err) => console.error("[PartnerLead upsert - verifyOTP] Non-fatal:", err.message));
    // ─────────────────────────────────────────────────────────────────────────

    return res.status(200).json({
      success: true,
      message: exists
        ? "Phone verified. Existing account found — complete your operator setup."
        : "Phone verified successfully. Complete your registration.",
      exists,
      userName: exists && user ? user.name : null,
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

    // Verify OTP was completed (security check — prevents skipping the OTP step)
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

    // ── Mark any otp_verified lead as converted (fire-and-forget) ─────────────
    const normalizedPhone = normalizePhone(savedUser.phone || phone);
    if (normalizedPhone) {
      PartnerLead.updateMany(
        { phone: normalizedPhone, leadType: "otp_verified" },
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
    if (refreshToken) responseData.refreshToken = refreshToken;

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
 * POST /api/auth/busowner/login
 *
 * Dedicated login endpoint for the bus owner portal.
 *
 * Key differences vs. the shared /api/login:
 *  1. Phone is normalized before lookup (handles +977, 977, 09xxx variants)
 *  2. Enforces busOwner role — non-operators get a clear rejection
 *  3. Route-level rate limiting (see busOwnerAuthRoutes.js)
 *  4. Uses X-App-Source enforcement via token activeRole
 */
const login = async (req, res) => {
  try {
    const { password } = req.body;
    const rawPhone = req.body.phone || req.body.emailOrPhone;

    if (!rawPhone || !password) {
      return res.status(400).json({
        success: false,
        message: `${!rawPhone ? "Phone number" : "Password"} is required.`,
      });
    }

    // Normalize phone for lookup
    const phone = normalizePhone(rawPhone);

    // Find user — select password and security fields
    const user = await User.findOne({
      $or: [{ phone }, { phone: rawPhone }],
      deletedAt: null,
    }).select("+password failedLoginAttempts lockedUntil status roles role forcePasswordChange suspensionReason suspendedAt");

    // Vague response — don't reveal whether the account exists
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid phone number or password." });
    }

    // Soft-delete check
    if (user.deletedAt) {
      return res.status(403).json({
        success: false,
        message: "This account has been deactivated. Please contact support.",
        errorCode: "ACCOUNT_DEACTIVATED",
      });
    }

    // Account lock check (after repeated failed logins)
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      return res.status(429).json({
        success: false,
        message: `Account temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute(s).`,
        errorCode: "ACCOUNT_LOCKED",
      });
    }

    // Ban / suspension check
    if (user.status === "banned") {
      return res.status(403).json({
        success: false,
        message: user.suspensionReason
          ? `Your account has been suspended. Reason: ${user.suspensionReason}`
          : "Your account has been suspended. Please contact support.",
        errorCode: "ACCOUNT_BANNED",
      });
    }

    if (user.status === "inactive") {
      return res.status(403).json({
        success: false,
        message: user.suspensionReason
          ? `Your account has been deactivated. Reason: ${user.suspensionReason}`
          : "Your account has been deactivated. Please contact support.",
        errorCode: "ACCOUNT_INACTIVE",
      });
    }

    // Check that this user has the busOwner role
    const userRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
    if (!userRoles.includes("busOwner")) {
      return res.status(403).json({
        success: false,
        message: "You don't have an operator account. Please register as a bus operator first.",
        errorCode: "ROLE_NOT_FOUND",
      });
    }

    // Password verification
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      // Track failed attempts — lock after 5
      const MAX_ATTEMPTS = 5;
      const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

      const newFailedCount = (user.failedLoginAttempts || 0) + 1;
      const updatePayload = { $inc: { failedLoginAttempts: 1 } };

      if (newFailedCount >= MAX_ATTEMPTS) {
        updatePayload.$set = { lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) };
      }

      await User.findByIdAndUpdate(user._id, updatePayload);

      const remaining = MAX_ATTEMPTS - newFailedCount;
      const message = remaining > 0
        ? `Invalid phone number or password. ${remaining} attempt(s) remaining.`
        : "Too many failed attempts. Account locked for 15 minutes.";

      return res.status(401).json({ success: false, message });
    }

    // Force password change (admin-set temp password)
    if (user.forcePasswordChange) {
      const jwt = require("jsonwebtoken");
      const tempToken = jwt.sign(
        { id: user._id, purpose: "FORCE_PASSWORD_CHANGE" },
        process.env.SECRET_KEY,
        { expiresIn: "15m" }
      );
      return res.status(200).json({
        success: true,
        message: "You must change your temporary password before proceeding.",
        forcePasswordChange: true,
        tempToken,
      });
    }

    // ✅ SUCCESS — reset failed attempt counters
    await User.findByIdAndUpdate(user._id, {
      $set: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    // Issue token pair with activeRole: "busOwner"
    const { accessToken, refreshToken } = await generateTokenPair(user, {
      deviceInfo: req.get("User-Agent") || null,
      ipAddress: req.ip || req.socket?.remoteAddress || null,
      activeRole: "busOwner",
    });

    const userObj = user.toObject();
    delete userObj.password;

    const responseData = {
      success: true,
      message: "Login successful.",
      user: userObj,
      accessToken,
      activeRole: "busOwner",
    };
    if (refreshToken) responseData.refreshToken = refreshToken;

    return res.status(200).json(responseData);
  } catch (error) {
    console.error("[BusOwner login] Error:", error.message);
    return res.status(500).json({ success: false, message: "Login failed. Please try again." });
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

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(200).json({ success: true, message: "If an account exists, OTP has been sent." });
    }

    // Role-aware phone check - ensure they are a busOwner
    const { hasRole } = await checkPhoneForRole(phone, "busOwner");
    if (!hasRole) {
      return res.status(200).json({ success: true, message: "If an account exists, OTP has been sent." }); // vague
    }

    await createAndSendOTP(user.phone, "BUSOWNER_PASSWORD_RESET");

    return res.status(200).json({
      success: true,
      message: "OTP sent to registered phone!",
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

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const { hasRole } = await checkPhoneForRole(phone, "busOwner");
    if (!hasRole) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const result = await verifyOTPCode(user.phone, otp, "BUSOWNER_PASSWORD_RESET", false);
    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.error });
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

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const { hasRole } = await checkPhoneForRole(phone, "busOwner");
    if (!hasRole) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Verify AND mark as used
    const result = await verifyOTPCode(user.phone, otp, "BUSOWNER_PASSWORD_RESET", true);
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

/**
 * POST /api/auth/busowner/refresh
 *
 * Exchanges a valid refresh token for a new access + refresh token pair.
 * Uses token rotation — the old refresh token is deleted (single-use).
 *
 * Body: { refreshToken: string }
 */
const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ success: false, message: "Refresh token is required." });
    }

    const { accessToken, refreshToken: newRefreshToken } = await rotateRefreshToken(refreshToken, {
      deviceInfo: req.headers["user-agent"] || null,
      ipAddress: req.ip || null,
    });

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully.",
      accessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    const message =
      error.message === "INVALID_REFRESH_TOKEN" ? "Session expired. Please sign in again." :
      error.message === "REFRESH_TOKEN_EXPIRED"  ? "Session expired. Please sign in again." :
      error.message === "ACCOUNT_BANNED"         ? "Your account has been suspended." :
      error.message === "ROLE_REVOKED"           ? "Access revoked. Please contact support." :
      "Session could not be renewed. Please sign in again.";

    const status =
      error.message === "ACCOUNT_BANNED" ? 403 :
      error.message === "ROLE_REVOKED"   ? 403 : 401;

    console.error("[BusOwner refresh] Error:", error.message);
    return res.status(status).json({ success: false, message });
  }
};

/**
 * POST /api/auth/busowner/logout
 *
 * Revokes the refresh token for the current device.
 * The access token is short-lived (15 min) and will expire naturally.
 *
 * Body: { refreshToken: string }
 */
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    // Always return 200 — don't leak whether the token existed or not
    return res.status(200).json({ success: true, message: "Logged out successfully." });
  } catch (error) {
    console.error("[BusOwner logout] Error:", error.message);
    // Still return 200 — logout should never fail from the user's perspective
    return res.status(200).json({ success: true, message: "Logged out successfully." });
  }
};

module.exports = {
  sendOTP,
  verifyOTP,
  register,
  resendOTP,
  login,
  requestPasswordReset,
  verifyOtpForReset,
  resetPassword,
  resendOtpForReset,
  refresh,
  logout,
};

