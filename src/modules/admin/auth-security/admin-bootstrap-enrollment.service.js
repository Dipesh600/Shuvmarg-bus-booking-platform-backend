"use strict";

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const BootstrapState = require("../../../../models/adminBootstrapStateModel");
const SuperAdmin = require("../../../../models/adminModel");
const { hashToken } = require("./admin-auth.crypto");
const { createEnrollment, matchedCounter, recoveryCodes, secretForAdmin } = require("./admin-mfa.service");
const { authError } = require("./admin-auth.errors");
const { recordSecurityEvent } = require("./admin-security-audit.service");

async function resolveProvisioningRoot(token, session = null) {
  if (!token) throw authError("INVALID_ENROLLMENT", "Invalid or expired enrollment", 401);
  const stateQuery = BootstrapState.findOne({ key: "INITIAL_ROOT_ADMIN" })
    .select("+enrollmentTokenHash");
  if (session) stateQuery.session(session);
  const state = await stateQuery;
  const invalid = !state || state.status !== "PROVISIONING" ||
    !state.enrollmentExpiresAt || state.enrollmentExpiresAt <= new Date() ||
    state.enrollmentTokenHash !== hashToken(token);
  if (invalid) throw authError("INVALID_ENROLLMENT", "Invalid or expired enrollment", 401);
  const adminQuery = SuperAdmin.findById(state.rootAdminId)
    .select("+password +pendingEncryptedTwoFactorSecret +recoveryCodeHashes");
  if (session) adminQuery.session(session);
  const admin = await adminQuery;
  if (!admin || !admin.isRootAdmin || admin.lifecycleStatus !== "MFA_PENDING") {
    throw authError("INVALID_ENROLLMENT", "Invalid or expired enrollment", 401);
  }
  return { state, admin };
}

async function beginRootEnrollment({ token, password, requestContext = {} }) {
  const { admin } = await resolveProvisioningRoot(token);
  if (!password || !(await bcrypt.compare(password, admin.password))) {
    throw authError("INVALID_ENROLLMENT", "Invalid or expired enrollment", 401);
  }
  const enrollment = await createEnrollment(admin.email);
  admin.pendingEncryptedTwoFactorSecret = enrollment.encryptedSecret;
  await admin.save();
  await recordSecurityEvent("MFA_ENROLLMENT_STARTED", {
    targetAdminId: admin._id, ...requestContext,
  });
  return {
    qrCodeDataUrl: enrollment.qrCodeDataUrl,
    manualEntryKey: enrollment.manualEntryKey,
    adminId: admin.adminId,
    email: admin.email,
  };
}

async function confirmRootEnrollment({ token, otp, requestContext = {} }) {
  const codes = await recoveryCodes();
  const session = await mongoose.startSession();
  let adminId;
  try {
    await session.withTransaction(async () => {
      const { state, admin } = await resolveProvisioningRoot(token, session);
      const secret = secretForAdmin(admin, true);
      const counter = secret && matchedCounter(secret, otp);
      if (counter === null) throw authError("INVALID_MFA_CODE", "Invalid or expired code", 401);
      Object.assign(admin, {
        encryptedTwoFactorSecret: admin.pendingEncryptedTwoFactorSecret,
        pendingEncryptedTwoFactorSecret: undefined,
        twoFactorSecret: undefined,
        twoFactorEnabled: true,
        mfaConfirmedAt: new Date(),
        lastOtpWindowUsed: counter,
        recoveryCodeHashes: codes.hashes,
        lifecycleStatus: "ACTIVE",
        isActive: true,
      });
      await admin.save({ session });
      Object.assign(state, {
        status: "COMPLETED", completedAt: new Date(),
        enrollmentTokenHash: undefined, enrollmentExpiresAt: undefined,
      });
      await state.save({ session });
      adminId = admin._id;
    });
  } finally {
    await session.endSession();
  }
  await recordSecurityEvent("MFA_ENROLLED", { targetAdminId: adminId, ...requestContext });
  return { recoveryCodes: codes.raw };
}

module.exports = { beginRootEnrollment, confirmRootEnrollment, resolveProvisioningRoot };
