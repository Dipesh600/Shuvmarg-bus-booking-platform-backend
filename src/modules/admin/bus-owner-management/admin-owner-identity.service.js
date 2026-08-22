"use strict";

const bcrypt = require("bcryptjs");
const User = require("../../../../models/userModel");
const sendOTP = require("../../../../handlers/sparro-otp");
const generatePassword = require("../../../../handlers/passwordGenerator");
const { resolveOperatorLoginUrl, temporaryCredentialTtlMs } = require("./operator-portal.config");

async function prepareOwnerIdentity(body, deps = {}) {
  const UserModel = deps.User || User;
  const query = { $or: [{ phone: body.phone }] };
  if (body.email) query.$or.push({ email: body.email });
  const existing = await UserModel.findOne(query);
  if (existing) {
    const roles = Array.isArray(existing.roles) && existing.roles.length ? existing.roles : [existing.role];
    if (roles.includes("busOwner")) {
      const error = new Error("This user is already registered as a bus owner!");
      error.statusCode = 400;
      error.code = "ROLE_ALREADY_REGISTERED";
      throw error;
    }
    return { existingUser: existing, isNew: false };
  }
  const now = (deps.clock || (() => new Date()))();
  const password = (deps.generatePassword || generatePassword)(12);
  const expiresAt = new Date(now.getTime() + temporaryCredentialTtlMs(deps.env));
  const passwordHash = await (deps.bcryptHash || bcrypt.hash)(password, 12);
  const userData = {
    name: body.ownerName, phone: body.phone, address: body.address,
    password: passwordHash, gender: "male", role: "busOwner", roles: ["busOwner"],
    status: "active", forcePasswordChange: true,
    roleActivatedAt: { busOwner: now },
    temporaryCredentialIssuedAt: now,
    temporaryCredentialExpiresAt: expiresAt,
    temporaryCredentialVersion: 1,
    temporaryCredentialIssuedBy: deps.issuedBy || null,
  };
  if (body.email) userData.email = body.email;
  return { userData, password, expiresAt, isNew: true };
}

async function createUnnotifiedUser(prepared, deps = {}) {
  const user = new (deps.User || User)(prepared.userData);
  const savedUser = await user.save();
  return { user: savedUser, wasCreated: true, roleWasAdded: false, password: prepared.password };
}

async function addOwnerRoleToExistingUser(existingUser, deps = {}) {
  const user = await (deps.User || User).findByIdAndUpdate(existingUser._id, {
    $addToSet: { roles: "busOwner" },
    $set: { "roleActivatedAt.busOwner": (deps.clock || (() => new Date()))(), forcePasswordChange: false },
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
  if (status === "DELIVERED") set["accessNotification.deliveredAt"] = now;
  await (deps.User || User).findByIdAndUpdate(userId, {
    $set: set, $inc: { "accessNotification.attempts": 1 },
  }).catch(() => {});
}

async function sendAccessSms({ userId, phone, message }, deps = {}) {
  try {
    await (deps.sendOTP || sendOTP)(phone, message);
    await recordDelivery(userId, "DELIVERED", deps);
    return { status: "DELIVERED", channel: "SMS", canRetry: false };
  } catch (error) {
    (deps.logger || console).warn("[Admin Owner Access] SMS delivery failed:", error.message);
    await recordDelivery(userId, "FAILED", deps);
    return { status: "FAILED", channel: "SMS", canRetry: true };
  }
}

async function notifyNewOwnerCredentials(input, deps = {}) {
  if (!input.password) return { status: "NOT_REQUIRED", channel: "SMS", canRetry: false };
  const loginUrl = input.loginUrl || resolveOperatorLoginUrl(deps.env);
  const expiry = input.expiresAt ? new Date(input.expiresAt).toISOString() : "within 24 hours";
  const message = `Shuvmarg operator account created. Login phone: ${input.phone}. One-time password: ${input.password}. Sign in at ${loginUrl} and change the password before ${expiry}. Do not share these credentials.`;
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
