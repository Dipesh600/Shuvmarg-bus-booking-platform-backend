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
const Agent   = require("../../models/agentModel.js");
const PartnerLead = require("../../models/PartnerLead.js");
const bcrypt  = require("bcryptjs");
const { normalizePhone, checkPhoneForRole } = require("../../utils/phoneGuard.js");
const { createAndSendOTP, verifyOTPCode }   = require("../../utils/otpHelper.js");
const { validatePassword }                   = require("../../utils/passwordValidator.js");
const {
  generateTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
} = require("../../utils/tokenService.js");

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

// ── Registration Flow ─────────────────────────────────────────────────────────

/**
 * POST /api/auth/agent/sendOTP
 *
 * Send OTP for agent self-registration.
 * Blocks only if the phone already has the "agent" role.
 * Allows existing passengers/bus owners to upgrade (add agent role).
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

    // Role-aware phone check — only block if already an agent WITH a complete Agent document.
    // If the user has the "agent" role but no Agent doc, it means a previous registration
    // attempt failed mid-way (orphaned state) — allow them to retry.
    const { exists, hasRole, user } = await checkPhoneForRole(phone, "agent");

    if (exists && hasRole) {
      // Check if this is an orphaned state (role flag set but Agent doc missing)
      const agentDoc = await Agent.findOne({ user: user._id }).select("_id").lean();
      if (agentDoc) {
        // Fully registered agent — block and tell them to log in
        return res.status(409).json({
          success: false,
          message: "This mobile number is already registered as an agent. Please log in instead.",
          errorCode: "ROLE_ALREADY_REGISTERED",
          hint: "login",
        });
      }
      // No Agent doc — orphaned state, fall through and allow OTP
      console.warn(`[Agent sendOTP] Orphaned agent role detected for phone ${phone} — allowing re-registration`);
    }

    // Block banned or deactivated accounts
    if (exists && user && (user.status === "banned" || user.status === "inactive")) {
      return res.status(403).json({
        success: false,
        message: "This account has been suspended. Please contact support.",
        errorCode: "ACCOUNT_SUSPENDED",
      });
    }

    const result = await createAndSendOTP(phone, "AGENT_REGISTRATION");

    return res.status(200).json({
      success: true,
      message: "Verification code sent successfully.",
      data: { phone, expiresIn: result.expiresIn },
    });
  } catch (error) {
    if (handleOtpSendBlockedError(error, res)) return;
    console.error("[Agent sendOTP] Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to send verification code. Please try again." });
  }
};

/**
 * POST /api/auth/agent/verifyOTP
 *
 * Verify OTP for agent self-registration.
 * Returns whether the phone belongs to an existing user (for upgrade UX).
 *
 * Side-effect: upserts an otp_verified + entityType:agent PartnerLead so
 * the lead is captured even if the user abandons registration after this step.
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

    const result = await verifyOTPCode(phone, cleanOtp, "AGENT_REGISTRATION");
    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.error });
    }

    // Race-condition guard — check role wasn't added between sendOTP and verifyOTP
    const { exists, hasRole, user } = await checkPhoneForRole(phone, "agent");
    if (exists && hasRole) {
      return res.status(409).json({
        success: false,
        message: "This mobile number is already registered as an agent.",
        errorCode: "ROLE_ALREADY_REGISTERED",
      });
    }

    // ── Capture as otp_verified agent lead (fire-and-forget) ─────────────────
    // Upsert so we don't overwrite an existing lead — we create a separate
    // otp_verified record instead.
    PartnerLead.findOneAndUpdate(
      { phone, leadType: "otp_verified", entityType: "agent" },
      {
        phone,
        leadType: "otp_verified",
        entityType: "agent",
        phoneVerified: true,
        source: "agent_app",
        $setOnInsert: { status: "new" },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).catch((err) => console.error("[PartnerLead upsert - agent verifyOTP] Non-fatal:", err.message));
    // ─────────────────────────────────────────────────────────────────────────

    return res.status(200).json({
      success: true,
      message: exists
        ? "Phone verified. Existing account found — complete your agent setup."
        : "Phone verified successfully. Complete your registration.",
      exists,
      userName: exists && user ? user.name : null,
      // Tell the frontend what role(s) this phone already has so it can show a clear message
      existingRoles: exists && user
        ? (user.roles && user.roles.length > 0 ? user.roles : [user.role]).filter(Boolean)
        : [],
    });
  } catch (error) {
    console.error("[Agent verifyOTP] Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to verify code. Please try again." });
  }
};

/**
 * POST /api/auth/agent/register
 *
 * Complete agent self-registration using "Find-or-Upgrade" pattern.
 *
 * Scenarios:
 *   a. Phone NOT in DB → Create new User + Agent profile
 *   b. Phone exists, already has "agent" role → Error (race condition)
 *   c. Phone exists, different role → Add "agent" to roles[], create Agent profile
 *      (password stays unchanged, User.status stays "active")
 */
const register = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const { name, password, email } = req.body;

    if (!phone || !name) {
      const missing = !phone ? "Phone" : "Name";
      return res.status(400).json({ success: false, message: `${missing} is required.` });
    }

    if (name.trim().length < 3) {
      return res.status(400).json({ success: false, message: "Name must be at least 3 characters." });
    }

    // Verify OTP was completed (security check — prevents skipping the OTP step)
    const OTP = require("../../models/otpModel.js");
    const otpRecord = await OTP.findOne({ phone, purpose: "AGENT_REGISTRATION", isUsed: true });
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

    // === FIND-OR-UPGRADE (with orphan repair) ===
    const { exists, hasRole, user: existingUser } = await checkPhoneForRole(phone, "agent");

    if (exists && hasRole) {
      // Check if this is an orphaned state — role in User.roles but no Agent doc
      const agentDoc = await Agent.findOne({ user: existingUser._id }).select("_id").lean();
      if (agentDoc) {
        // Fully registered — block
        return res.status(409).json({
          success: false,
          message: "This mobile number is already registered as an agent. Please log in instead.",
          errorCode: "ROLE_ALREADY_REGISTERED",
          hint: "login",
        });
      }
      // No Agent doc — orphaned state: fall through to the upgrade/repair path below
      // (existingUser is set, so the `if (exists && existingUser)` branch will handle it)
      console.warn(`[Agent register] Repairing orphaned agent role for user ${existingUser._id}`);
    }

    let savedUser;
    let isUpgradePath = false;

    if (exists && existingUser) {
      // === UPGRADE PATH: Existing user → add "agent" role ===
      // We ALSO update the password to the new one the user typed during registration.
      // This is intentional: if they don't remember their old password and set a new one,
      // we honor that new password. OTP verification already proved phone ownership.
      isUpgradePath = true;

      if (!password) {
        return res.status(400).json({
          success: false,
          message: "Password is required.",
        });
      }

      const passwordCheck = validatePassword(password);
      if (!passwordCheck.valid) {
        return res.status(400).json({
          success: false,
          message: passwordCheck.errors[0],
          errors: passwordCheck.errors,
        });
      }

      const hashedPassword = await bcrypt.hash(password, 12);

      savedUser = await User.findByIdAndUpdate(
        existingUser._id,
        {
          $addToSet: { roles: "agent" },
          $set: {
            "roleActivatedAt.agent": new Date(),
            password: hashedPassword,   // ← replace password with the new one
          },
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
        role: "agent",
        roles: ["agent"],
        status: "active",         // Approval lives on Agent.applicationStatus, NOT User.status
        phoneVerified: true,
        isVerified: false,
        roleActivatedAt: { agent: new Date() },
      };
      if (email) userData.email = email.toLowerCase().trim();

      const newUser = new User(userData);
      savedUser = await newUser.save();
    }

    // Create Agent KYC skeleton — use upsert to handle concurrent/retry requests safely
    const agentDoc = await Agent.findOneAndUpdate(
      { user: savedUser._id },
      {
        $setOnInsert: {
          user: savedUser._id,
          applicationStatus: "DRAFT",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // findOneAndUpdate bypasses pre("save") middleware, so agentId won't be auto-generated.
    // If the doc was just inserted and has no agentId, trigger a save() to generate it.
    if (!agentDoc.agentId) {
      await agentDoc.save();
    }

    // Issue tokens with activeRole: "agent"
    const { accessToken, refreshToken } = await generateTokenPair(savedUser, {
      deviceInfo: req.get("User-Agent") || null,
      ipAddress: req.ip || req.socket?.remoteAddress || null,
      activeRole: "agent",
    });

    const userObj = savedUser.toObject ? savedUser.toObject() : { ...savedUser };
    delete userObj.password;

    // ── Mark any otp_verified agent lead as converted (fire-and-forget) ───────
    const normalizedPhone = normalizePhone(savedUser.phone || phone);
    if (normalizedPhone) {
      PartnerLead.updateMany(
        { phone: normalizedPhone, leadType: "otp_verified", entityType: "agent" },
        { $set: { status: "converted", fullName: name.trim() } }
      ).catch((err) => console.error("[PartnerLead convert - agent register] Non-fatal:", err.message));
    }
    // ─────────────────────────────────────────────────────────────────────────

    const responseData = {
      success: true,
      message: isUpgradePath
        ? "Agent access added to your account. Your new password has been set."
        : "Account created successfully. Complete your setup to start using Shuv Marg.",
      user: userObj,
      accessToken,
      activeRole: "agent",
      isUpgrade: isUpgradePath,
      applicationStatus: "DRAFT",
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
    console.error("[Agent register] Error:", error.message, error.stack?.split("\n")?.[1]);

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      const fieldLabel =
        field === "phone" ? "Mobile number" :
        field === "email" ? "Email address" :
        field === "user"  ? "Phone number" :   // Agent.user unique — means they already have an agent account
        field === "agentId" ? "Agent ID" :
        null;

      if (field === "user") {
        // The user already has an Agent record — this is a race condition / retry.
        // Safe to treat as success — tell them to proceed to setup.
        return res.status(409).json({
          success: false,
          message: "An agent account for this phone number already exists. Please log in instead.",
          errorCode: "AGENT_ALREADY_EXISTS",
          hint: "login",
        });
      }

      return res.status(409).json({
        success: false,
        message: fieldLabel
          ? `${fieldLabel} is already registered.`
          : "This information is already registered with another account.",
      });
    }

    return res.status(500).json({ success: false, message: "Registration failed. Please try again." });
  }
};

/**
 * POST /api/auth/agent/resendOTP
 *
 * Resend OTP for agent registration.
 * Rate-limited via blockedUntil in the OTP document (max 3 sends per 10 min).
 */
const resendOTP = async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);

    if (!phone) {
      return res.status(400).json({ success: false, message: "Phone number is required." });
    }

    // Only resend if not already an agent (prevents fishing for existing accounts)
    const { exists, hasRole } = await checkPhoneForRole(phone, "agent");
    if (exists && hasRole) {
      return res.status(409).json({
        success: false,
        message: "This mobile number is already registered as an agent.",
        errorCode: "ROLE_ALREADY_REGISTERED",
      });
    }

    const result = await createAndSendOTP(phone, "AGENT_REGISTRATION");

    return res.status(200).json({
      success: true,
      message: "New verification code sent.",
      data: { expiresIn: result.expiresIn },
    });
  } catch (error) {
    if (handleOtpSendBlockedError(error, res)) return;
    console.error("[Agent resendOTP] Error:", error.message);
    return res.status(500).json({ success: false, message: "Failed to resend code. Please try again." });
  }
};

// ── Login Flow ────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/agent/login
 *
 * Dedicated login endpoint for the agent portal.
 *
 * Key differences vs. the shared /api/login:
 *   1. Phone is normalized before lookup (handles +977, 977, 09xxx variants)
 *   2. Enforces agent role — non-agents get a clear rejection
 *   3. Route-level rate limiting (see agentAuthRoutes.js)
 *   4. Uses activeRole: "agent" in token payload
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

    // Check that this user has the agent role
    const userRoles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
    if (!userRoles.includes("agent")) {
      return res.status(403).json({
        success: false,
        message: "You don't have an agent account. Please register as an agent first.",
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

    // Issue token pair with activeRole: "agent"
    const { accessToken, refreshToken } = await generateTokenPair(user, {
      deviceInfo: req.get("User-Agent") || null,
      ipAddress: req.ip || req.socket?.remoteAddress || null,
      activeRole: "agent",
    });

    const userObj = user.toObject();
    delete userObj.password;

    const responseData = {
      success: true,
      message: "Login successful.",
      user: userObj,
      accessToken,
      activeRole: "agent",
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

    return res.status(200).json(responseData);
  } catch (error) {
    console.error("[Agent login] Error:", error.message);
    return res.status(500).json({ success: false, message: "Login failed. Please try again." });
  }
};

// ── Token Management ──────────────────────────────────────────────────────────

/**
 * POST /api/auth/agent/refresh
 *
 * Exchanges a valid refresh token for a new access + refresh token pair.
 * Uses token rotation — the old refresh token is deleted (single-use).
 *
 * Body: { refreshToken: string }
 */
const refresh = async (req, res) => {
  try {
    // NEW-FINDING-01: Cookie-first, body as fallback (supports both web credentials:include and Flutter body-based)
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ success: false, message: "Session expired. Please sign in again." });
    }

    const { accessToken, refreshToken: newRefreshToken } = await rotateRefreshToken(refreshToken, {
      deviceInfo: req.headers["user-agent"] || null,
      ipAddress: req.ip || null,
    });

    // Refresh token delivered via httpOnly cookie only — not in response body (FINDING-06)
    if (newRefreshToken) {
      res.cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully.",
      accessToken,
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

    console.error("[Agent refresh] Error:", error.message);
    return res.status(status).json({ success: false, message });
  }
};

/**
 * POST /api/auth/agent/logout
 *
 * Revokes the refresh token for the current device.
 * The access token is short-lived and will expire naturally.
 *
 * Reads refresh token from httpOnly cookie (web) or request body (Flutter).
 */
const logout = async (req, res) => {
  try {
    // NEW-FINDING-01: Cookie-first, body as fallback
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    // Clear the httpOnly cookie regardless of whether a token was found
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
    });

    // Always return 200 — don't leak whether the token existed or not
    return res.status(200).json({ success: true, message: "Logged out successfully." });
  } catch (error) {
    console.error("[Agent logout] Error:", error.message);
    res.clearCookie("refreshToken", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "Lax" });
    return res.status(200).json({ success: true, message: "Logged out." }); // Always succeed for logout
  }
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

    const user = await User.findOne({ phone });
    if (!user) {
      // Vague — don't reveal whether the account exists
      return res.status(200).json({ success: true, message: "If an account exists, OTP has been sent." });
    }

    const { hasRole } = await checkPhoneForRole(phone, "agent");
    if (!hasRole) {
      return res.status(200).json({ success: true, message: "If an account exists, OTP has been sent." });
    }

    await createAndSendOTP(user.phone, "AGENT_PASSWORD_RESET");

    return res.status(200).json({
      success: true,
      message: "OTP sent to registered phone.",
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

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(400).json({ success: false, message: "Invalid OTP or phone number." });
    }

    const { hasRole } = await checkPhoneForRole(phone, "agent");
    if (!hasRole) {
      return res.status(400).json({ success: false, message: "Invalid OTP or phone number." });
    }

    // Verify but do NOT mark as used (false = peek only)
    const result = await verifyOTPCode(user.phone, cleanOtp, "AGENT_PASSWORD_RESET", false);
    if (!result.valid) {
      return res.status(400).json({ success: false, message: result.error });
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
  sendOTP,
  verifyOTP,
  register,
  resendOTP,
  login,
  refresh,
  logout,
  requestPasswordReset,
  verifyOtpForReset,
  resetPassword,
  resendOtpForReset,
};
