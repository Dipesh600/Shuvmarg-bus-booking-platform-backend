"use strict";

const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const User = require("../../../../models/userModel");
const generatePassword = require("../../../../handlers/passwordGenerator");
const { resolveAuthorizedAdminActor } = require("./admin-actor.resolver");
const { notifyNewOwnerCredentials, notifyExistingOwnerAccess } = require("./admin-owner-identity.service");
const { resolveOperatorLoginUrl, temporaryCredentialTtlMs } = require("./operator-portal.config");

function ownerAccessError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

function ownerRoles(user) {
  return Array.isArray(user.roles) && user.roles.length ? user.roles : [user.role];
}

function createOwnerAccessResendService(deps = {}) {
  const UserModel = deps.User || User;
  const resolveActor = deps.resolveAuthorizedAdminActor || resolveAuthorizedAdminActor;
  const clock = deps.clock || (() => new Date());

  async function resendOwnerAccess({ userId, actor }) {
    const admin = await resolveActor(actor, deps);
    const isValidUserId = deps.isValidUserId || mongoose.isValidObjectId;
    if (!isValidUserId(userId)) {
      throw ownerAccessError("Bus owner account not found.", 404, "BUS_OWNER_ACCOUNT_NOT_FOUND");
    }
    const user = await UserModel.findById(userId).select(
      "+temporaryCredentialVersion +temporaryCredentialExpiresAt"
    );
    if (!user || user.deletedAt || !ownerRoles(user).includes("busOwner")) {
      throw ownerAccessError("Bus owner account not found.", 404, "BUS_OWNER_ACCOUNT_NOT_FOUND");
    }
    if (user.status !== "active") {
      throw ownerAccessError("Bus owner account is not active.", 409, "BUS_OWNER_ACCOUNT_INACTIVE");
    }
    const loginUrl = resolveOperatorLoginUrl(deps.env);
    if (!user.forcePasswordChange) {
      const notification = await (deps.notifyExistingOwnerAccess || notifyExistingOwnerAccess)({
        userId: user._id, phone: user.phone, ownerName: user.name, loginUrl,
      }, deps);
      return { credentialMode: "EXISTING_PASSWORD", notification };
    }

    const now = clock();
    const password = (deps.generatePassword || generatePassword)(12);
    const expiresAt = new Date(now.getTime() + temporaryCredentialTtlMs(deps.env));
    const passwordHash = await (deps.bcryptHash || bcrypt.hash)(password, 12);
    const credentialVersion = Number(user.temporaryCredentialVersion || 0);
    const updated = await UserModel.findOneAndUpdate(
      {
        _id: user._id,
        forcePasswordChange: true,
        ...(credentialVersion === 0
          ? { $or: [{ temporaryCredentialVersion: 0 }, { temporaryCredentialVersion: { $exists: false } }] }
          : { temporaryCredentialVersion: credentialVersion }),
      },
      {
        $set: {
          password: passwordHash,
          temporaryCredentialIssuedAt: now,
          temporaryCredentialExpiresAt: expiresAt,
          temporaryCredentialIssuedBy: admin._id,
          "accessNotification.status": "NOT_ATTEMPTED",
        },
        $inc: { temporaryCredentialVersion: 1, tokenVersion: 1 },
      },
      { new: true }
    );
    if (!updated) {
      throw ownerAccessError("Temporary credential state changed. Reload and try again.", 409, "TEMPORARY_CREDENTIAL_CONFLICT");
    }
    const notification = await (deps.notifyNewOwnerCredentials || notifyNewOwnerCredentials)({
      userId: updated._id, phone: updated.phone, email: updated.email,
      ownerName: updated.name, password, expiresAt, loginUrl,
    }, deps);
    return { credentialMode: "TEMPORARY_PASSWORD", notification };
  }
  return { resendOwnerAccess };
}

module.exports = { createOwnerAccessResendService };
