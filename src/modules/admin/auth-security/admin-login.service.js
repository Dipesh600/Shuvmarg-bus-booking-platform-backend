"use strict";

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const SuperAdmin = require("../../../../models/adminModel");
const { consumeRecoveryCode, matchedCounter, secretForAdmin } = require("./admin-mfa.service");
const errors = require("./admin-auth.errors");
const { recordSecurityEvent } = require("./admin-security-audit.service");

const LOCK_MS = 15 * 60 * 1000;

async function failedAttempt(admin, field, requestContext) {
  admin[field] = (admin[field] || 0) + 1;
  if (admin[field] >= 5) {
    admin.lockedUntil = new Date(Date.now() + LOCK_MS);
    admin[field] = 0;
    await recordSecurityEvent("ACCOUNT_TEMPORARILY_LOCKED", {
      targetAdminId: admin._id, outcome: "FAILURE", ...requestContext,
    });
  }
  await admin.save();
}

function issueAccessToken(admin) {
  return jwt.sign({
    id: admin._id, adminId: admin.adminId, email: admin.email, role: admin.role,
    purpose: "access", sessionVersion: admin.sessionVersion,
  }, process.env.SECRET_KEY, {
    algorithm: "HS256", expiresIn: "30m", issuer: "shuvmarg-admin",
    audience: "shuvmarg-super-admin",
  });
}

async function loginAdmin(input, requestContext = {}) {
  const query = input.adminId
    ? { adminId: String(input.adminId).toUpperCase() }
    : { email: String(input.email || "").toLowerCase() };
  const admin = await SuperAdmin.findOne(query).select(
    "+password +twoFactorSecret +encryptedTwoFactorSecret +recoveryCodeHashes"
  );
  if (!admin) throw errors.invalidCredentials();
  if (admin.lockedUntil && admin.lockedUntil > new Date()) throw errors.temporarilyLocked();
  if (admin.lockedUntil) admin.lockedUntil = undefined;
  if (!admin.isActive || admin.lifecycleStatus !== "ACTIVE") throw errors.enrollmentRequired();
  if (!input.password || !(await bcrypt.compare(input.password, admin.password))) {
    await failedAttempt(admin, "loginAttempts", requestContext);
    await recordSecurityEvent("LOGIN_FAILED", {
      targetAdminId: admin._id, outcome: "FAILURE", metadata: { factor: "PASSWORD" },
      ...requestContext,
    });
    throw errors.invalidCredentials();
  }
  if (!input.otp) throw errors.authError("MFA_CODE_REQUIRED", "Authenticator or recovery code is required", 400);
  const secret = secretForAdmin(admin);
  const suppliedCode = String(input.otp).trim().toLowerCase();
  const isTotp = /^\d{6}$/.test(suppliedCode);
  const counter = isTotp && secret ? matchedCounter(secret, suppliedCode) : null;
  const recoveryAccepted = !isTotp && /^[a-f0-9]{16}$/.test(suppliedCode)
    ? await consumeRecoveryCode(admin, suppliedCode)
    : false;
  if (!recoveryAccepted && (counter === null || counter <= (admin.lastOtpWindowUsed || 0))) {
    await failedAttempt(admin, "failedMfaAttempts", requestContext);
    await recordSecurityEvent("LOGIN_FAILED", {
      targetAdminId: admin._id, outcome: "FAILURE", metadata: { factor: "MFA" },
      ...requestContext,
    });
    throw errors.invalidCredentials();
  }
  Object.assign(admin, {
    loginAttempts: 0, failedMfaAttempts: 0, lockedUntil: undefined,
    accountLocked: false, lastLoginAt: new Date(),
    lastOtpWindowUsed: recoveryAccepted ? admin.lastOtpWindowUsed : counter,
  });
  await admin.save();
  if (recoveryAccepted) {
    await recordSecurityEvent("RECOVERY_CODE_USED", { targetAdminId: admin._id, ...requestContext });
  }
  await recordSecurityEvent("LOGIN_SUCCEEDED", { targetAdminId: admin._id, ...requestContext });
  const safeAdmin = admin.toObject();
  ["password", "twoFactorSecret", "encryptedTwoFactorSecret", "recoveryCodeHashes"]
    .forEach((key) => delete safeAdmin[key]);
  return { admin: safeAdmin, accessToken: issueAccessToken(admin) };
}

module.exports = { issueAccessToken, loginAdmin };
