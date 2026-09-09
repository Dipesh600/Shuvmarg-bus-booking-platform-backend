"use strict";
const { getEffectiveRoles } = require('../../../shared/auth/account-role.policy');

const mongoose = require("mongoose");
const User = require("../../../../models/userModel");
const { resolveAuthorizedAdminActor } = require("./admin-actor.resolver");
const { notifyNewOwnerCredentials, notifyExistingOwnerAccess } = require("./admin-owner-identity.service");
const { resolveOperatorLoginUrl } = require("./operator-portal.config");
const notificationOutbox = require("../../notifications/outbox");

function ownerAccessError(message, statusCode, code) {
  return Object.assign(new Error(message), { statusCode, code });
}

function ownerRoles(user) {
  return getEffectiveRoles(user);
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
    const user = await UserModel.findById(userId);
    if (!user || user.deletedAt || !ownerRoles(user).includes("busOwner")) {
      throw ownerAccessError("Bus owner account not found.", 404, "BUS_OWNER_ACCOUNT_NOT_FOUND");
    }
    if (!["active", "invited"].includes(user.status)) {
      throw ownerAccessError("Bus owner account is unavailable.", 409, "BUS_OWNER_ACCOUNT_INACTIVE");
    }
    const loginUrl = resolveOperatorLoginUrl(deps.env);
    const businessReference = `bus-owner-user:${user._id}`;
    const notificationVersion = `resend:${Math.floor(clock().getTime() / (5 * 60 * 1000))}`;
    await (deps.notificationOutbox || notificationOutbox).cancelPendingSms(businessReference, {
      excludeIdempotencyKey: `owner-access:${user._id}:${notificationVersion}`,
    });
    if (user.status === "active") {
      const notification = await (deps.notifyExistingOwnerAccess || notifyExistingOwnerAccess)({
        userId: user._id, phone: user.phone, ownerName: user.name, loginUrl,
      }, { ...deps, notificationVersion, manualReplay: { actorType: "ADMIN", actorId: admin._id,
        reason: "Operator access message resend", at: clock() } });
      return { credentialMode: "EXISTING_PASSWORD", notification };
    }
    const notification = await (deps.notifyNewOwnerCredentials || notifyNewOwnerCredentials)({
      userId: user._id, phone: user.phone, email: user.email,
      ownerName: user.name, loginUrl,
    }, { ...deps, notificationVersion, manualReplay: { actorType: "ADMIN", actorId: admin._id,
      reason: "Operator activation message resend", at: clock() } });
    return { credentialMode: "ACCOUNT_ACTIVATION", notification };
  }
  return { resendOwnerAccess };
}

module.exports = { createOwnerAccessResendService };
