"use strict";
const { getEffectiveRoles } = require('../../../shared/auth/account-role.policy');

const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const User = require("../../../../models/userModel");
const notificationOutbox = require("../../notifications/outbox");
const { resolveOperatorLoginUrl } = require("./operator-portal.config");

async function prepareOwnerIdentity(body, deps = {}) {
  const UserModel = deps.User || User;
  const query = { $or: [{ phone: body.phone }] };
  if (body.email) query.$or.push({ email: body.email });
  const existing = await UserModel.findOne(query);
  if (existing) {
    const roles = getEffectiveRoles(existing);
    if (roles.includes("busOwner")) {
      const error = new Error("This user is already registered as a bus owner!");
      error.statusCode = 400;
      error.code = "ROLE_ALREADY_REGISTERED";
      throw error;
    }
    return { existingUser: existing, isNew: false };
  }
  const now = (deps.clock || (() => new Date()))();
  const bootstrapSecret = (deps.generateBootstrapSecret || (() => crypto.randomBytes(32).toString("base64url")))();
  const passwordHash = await (deps.bcryptHash || bcrypt.hash)(bootstrapSecret, 12);
  const userData = {
    name: body.ownerName, phone: body.phone, address: body.address,
    password: passwordHash, gender: "male", role: "busOwner", roles: ["busOwner"],
    status: "invited", forcePasswordChange: true,
    roleActivatedAt: { busOwner: now },
  };
  if (body.email) userData.email = body.email;
  return { userData, isNew: true };
}

async function createUnnotifiedUser(prepared, deps = {}) {
  const user = new (deps.User || User)(prepared.userData);
  const savedUser = await user.save();
  return { user: savedUser, wasCreated: true, roleWasAdded: false };
}

async function addOwnerRoleToExistingUser(existingUser, deps = {}) {
  const user = await (deps.User || User).findByIdAndUpdate(existingUser._id, {
    $addToSet: { roles: "busOwner" },
    $set: { "roleActivatedAt.busOwner": (deps.clock || (() => new Date()))() },
  }, { new: true });
  return { user, wasCreated: false, roleWasAdded: true };
}

async function rollbackUserIdentity(commitResult, deps = {}) {
  if (!commitResult?.user?._id) return;
  const UserModel = deps.User || User;
  if (commitResult.wasCreated) await UserModel.findByIdAndDelete(commitResult.user._id).catch(() => {});
  else if (commitResult.roleWasAdded) await UserModel.findByIdAndUpdate(commitResult.user._id, {
    $pull: { roles: "busOwner" }, $unset: { "roleActivatedAt.busOwner": "" },
  }).catch(() => {});
}

async function recordDelivery(userId, status, deps = {}) {
  if (!userId) return;
  const now = (deps.clock || (() => new Date()))();
  const set = { "accessNotification.status": status, "accessNotification.lastAttemptAt": now };
  if (status === "PROVIDER_ACCEPTED") set["accessNotification.providerAcceptedAt"] = now;
  await (deps.User || User).findByIdAndUpdate(userId, {
    $set: set, $inc: { "accessNotification.attempts": 1 },
  }).catch(() => {});
}

async function sendAccessSms({ userId, phone, message }, deps = {}) {
  try {
    const businessReference = `bus-owner-user:${userId}`;
    const result = await (deps.notificationOutbox || notificationOutbox).dispatchSms({
      messageType: "OWNER_ACCESS",
      idempotencyKey: `owner-access:${userId}:${deps.notificationVersion || "initial"}`,
      businessReference,
      recipientPhone: phone,
      body: message,
      userId,
      ownerId: userId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      manualReplay: deps.manualReplay || undefined,
    }, deps.sendOTP ? { send: deps.sendOTP } : {});
    const accepted = ["PROVIDER_ACCEPTED", "DELIVERED"].includes(result?.status);
    const pending = ["PENDING", "RETRY_SCHEDULED", "PROCESSING"].includes(result?.status);
    const status = accepted ? "PROVIDER_ACCEPTED" : pending ? "PENDING" : "FAILED";
    await recordDelivery(userId, status, deps);
    return { status, channel: "SMS", canRetry: status === "FAILED",
      messageId: result?.jobId || null };
  } catch (error) {
    (deps.logger || console).warn("[Admin Owner Access] SMS delivery failed:", error.message);
    await recordDelivery(userId, "FAILED", deps);
    return { status: "FAILED", channel: "SMS", canRetry: true };
  }
}

async function notifyNewOwnerCredentials(input, deps = {}) {
  const loginUrl = input.loginUrl || resolveOperatorLoginUrl(deps.env);
  const activationUrl = loginUrl.replace(/\/login\/?$/, "/activate-account");
  const message = `Shuvmarg operator account created for ${input.phone}. Open ${activationUrl}, `
    + "choose Activate invited account, verify the SMS code, and create your password.";
  return sendAccessSms({ ...input, message }, deps);
}

async function notifyExistingOwnerAccess(input, deps = {}) {
  const loginUrl = input.loginUrl || resolveOperatorLoginUrl(deps.env);
  const message = `Shuvmarg operator access has been enabled for ${input.phone}. Sign in with your existing password at ${loginUrl}. Use Forgot password if needed.`;
  return sendAccessSms({ ...input, message }, deps);
}

module.exports = {
  prepareOwnerIdentity, createUnnotifiedUser, addOwnerRoleToExistingUser,
  rollbackUserIdentity, notifyNewOwnerCredentials, notifyExistingOwnerAccess,
};
