"use strict";

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const Invitation = require("../../../../models/adminInvitationModel");
const SuperAdmin = require("../../../../models/adminModel");
const { generateOneTimeToken, hashToken } = require("./admin-auth.crypto");
const { assertStrongPassword } = require("./admin-password.policy");
const { createEnrollment, matchedCounter, recoveryCodes, secretForAdmin } = require("./admin-mfa.service");
const { authError } = require("./admin-auth.errors");
const { recordSecurityEvent } = require("./admin-security-audit.service");
const { isValidAdminId, normalizeAdminId } = require("./admin-identity.policy");

const ROLES = new Set(["SUPER_ADMIN", "ADMIN", "SUB_ADMIN"]);

async function createInvitation(input, rootAdminId, requestContext = {}) {
  const email = String(input.email || "").trim().toLowerCase();
  const adminId = normalizeAdminId(input.adminId);
  if (!/^\S+@\S+\.\S+$/.test(email) || !isValidAdminId(adminId) || !ROLES.has(input.role)) {
    throw authError("INVALID_ADMIN_INVITATION", "Valid email, admin ID and role are required", 400);
  }
  if (await SuperAdmin.exists({ $or: [{ email }, { adminId }] })) {
    throw authError("ADMIN_ALREADY_EXISTS", "Administrator identity already exists", 409);
  }
  if (await Invitation.exists({ $or: [{ email }, { adminId }], consumedAt: null, expiresAt: { $gt: new Date() } })) {
    throw authError("ADMIN_INVITATION_EXISTS", "An active invitation already exists", 409);
  }
  const token = generateOneTimeToken();
  const invitation = await Invitation.create({
    tokenHash: hashToken(token), email, adminId, role: input.role,
    invitedBy: rootAdminId, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  await recordSecurityEvent("ADMIN_INVITED", {
    actorAdminId: rootAdminId, metadata: { email, adminId, role: input.role }, ...requestContext,
  });
  return { invitationId: invitation._id, token, expiresAt: invitation.expiresAt };
}

async function beginInvitationEnrollment(input, requestContext = {}) {
  assertStrongPassword(input.password);
  const password = await bcrypt.hash(input.password, 12);
  const session = await mongoose.startSession();
  let result;
  let adminId;
  try {
    await session.withTransaction(async () => {
      const invitation = await Invitation.findOne({ tokenHash: hashToken(input.token || "") })
        .select("+tokenHash").session(session);
      if (!invitation || invitation.consumedAt || invitation.expiresAt <= new Date()) {
        throw authError("INVALID_ADMIN_INVITATION", "Invalid or expired invitation", 401);
      }
      let admin = invitation.targetAdminId
        ? await SuperAdmin.findById(invitation.targetAdminId)
          .select("+pendingEncryptedTwoFactorSecret").session(session)
        : null;
      if (!admin) {
        [admin] = await SuperAdmin.create([{
          adminId: invitation.adminId, email: invitation.email, role: invitation.role, password,
          isRootAdmin: false, lifecycleStatus: "MFA_PENDING", isActive: false,
        }], { session });
        invitation.targetAdminId = admin._id;
        await invitation.save({ session });
      }
      const enrollment = await createEnrollment(admin.email);
      admin.pendingEncryptedTwoFactorSecret = enrollment.encryptedSecret;
      await admin.save({ session });
      adminId = admin._id;
      result = { qrCodeDataUrl: enrollment.qrCodeDataUrl,
        manualEntryKey: enrollment.manualEntryKey, adminId: admin.adminId, email: admin.email };
    });
  } finally {
    await session.endSession();
  }
  await recordSecurityEvent("MFA_ENROLLMENT_STARTED", { targetAdminId: adminId, ...requestContext });
  return result;
}

async function confirmInvitationEnrollment(input, requestContext = {}) {
  const codes = await recoveryCodes();
  const session = await mongoose.startSession();
  let actorAdminId;
  let adminId;
  try {
    await session.withTransaction(async () => {
      const invitationQuery = Invitation.findOne({ tokenHash: hashToken(input.token || "") })
        .select("+tokenHash").session(session);
      const invitation = await invitationQuery;
      if (!invitation || invitation.consumedAt || invitation.expiresAt <= new Date()) {
        throw authError("INVALID_ADMIN_INVITATION", "Invalid or expired invitation", 401);
      }
      const admin = await SuperAdmin.findById(invitation.targetAdminId)
        .select("+pendingEncryptedTwoFactorSecret +recoveryCodeHashes").session(session);
      const secret = admin && secretForAdmin(admin, true);
      const counter = secret && matchedCounter(secret, input.otp);
      if (counter === null) throw authError("INVALID_MFA_CODE", "Invalid or expired code", 401);
      Object.assign(admin, {
        encryptedTwoFactorSecret: admin.pendingEncryptedTwoFactorSecret,
        pendingEncryptedTwoFactorSecret: undefined, twoFactorEnabled: true,
        mfaConfirmedAt: new Date(), lastOtpWindowUsed: counter,
        recoveryCodeHashes: codes.hashes, lifecycleStatus: "ACTIVE", isActive: true,
      });
      await admin.save({ session });
      invitation.consumedAt = new Date();
      await invitation.save({ session });
      actorAdminId = invitation.invitedBy;
      adminId = admin._id;
    });
  } finally {
    await session.endSession();
  }
  await recordSecurityEvent("ADMIN_ACTIVATED", {
    actorAdminId, targetAdminId: adminId, ...requestContext,
  });
  return { recoveryCodes: codes.raw };
}

module.exports = { beginInvitationEnrollment, confirmInvitationEnrollment, createInvitation };
