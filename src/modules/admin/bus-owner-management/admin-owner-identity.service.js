"use strict";

const bcrypt = require("bcryptjs");
const User = require("../../../../models/userModel");
const sendOTP = require("../../../../handlers/sparro-otp");
const generatePassword = require("../../../../handlers/passwordGenerator");
const emailTemplate = require("../../../../handlers/password-email-template");
const emailManager = require("../../../../emailManager/emailManager");

async function prepareOwnerIdentity(body, deps = {}) {
  const UserModel = deps.User || User;
  const genPass = deps.generatePassword || generatePassword;
  const hasher = deps.bcryptHash || bcrypt.hash;

  const query = { $or: [{ phone: body.phone }] };
  if (body.email) query.$or.push({ email: body.email });

  const existing = await UserModel.findOne(query);
  if (existing) {
    const roles = Array.isArray(existing.roles) && existing.roles.length > 0 ? existing.roles : [existing.role];
    if (roles.includes("busOwner")) {
      const error = new Error("This user is already registered as a bus owner!");
      error.statusCode = 400;
      error.code = "ROLE_ALREADY_REGISTERED";
      throw error;
    }
    return { existingUser: existing, isNew: false };
  }

  const password = genPass(8);
  const passwordHash = await hasher(password, 12);

  const userData = {
    name: body.ownerName,
    phone: body.phone,
    address: body.address,
    password: passwordHash,
    gender: "male",
    role: "busOwner",
    roles: ["busOwner"],
    status: "active",
    forcePasswordChange: true,
    roleActivatedAt: { busOwner: new Date() },
  };
  if (body.email) userData.email = body.email;

  return { userData, password, isNew: true };
}

async function createUnnotifiedUser(prepared, deps = {}) {
  const UserModel = deps.User || User;
  const user = new UserModel(prepared.userData);
  const savedUser = await user.save();
  return { user: savedUser, wasCreated: true, roleWasAdded: false, password: prepared.password };
}

async function addOwnerRoleToExistingUser(existingUser, deps = {}) {
  const UserModel = deps.User || User;
  const user = await UserModel.findByIdAndUpdate(
    existingUser._id,
    {
      $addToSet: { roles: "busOwner" },
      $set: { "roleActivatedAt.busOwner": new Date(), forcePasswordChange: false },
    },
    { new: true }
  );
  return { user, wasCreated: false, roleWasAdded: true };
}

async function rollbackUserIdentity(commitResult, deps = {}) {
  if (!commitResult || !commitResult.user || !commitResult.user._id) return;
  const UserModel = deps.User || User;
  if (commitResult.wasCreated) {
    await UserModel.findByIdAndDelete(commitResult.user._id).catch(() => {});
  } else if (commitResult.roleWasAdded) {
    await UserModel.findByIdAndUpdate(commitResult.user._id, {
      $pull: { roles: "busOwner" },
      $unset: { "roleActivatedAt.busOwner": "" },
    }).catch(() => {});
  }
}

async function notifyNewOwnerCredentials({ phone, email, ownerName, password }, deps = {}) {
  const otpFn = deps.sendOTP || sendOTP;
  const emailFn = deps.emailManager || emailManager;
  if (!password) return;

  try {
    await otpFn(phone, `Welcome to Sumarg! Your bus owner login: Phone: ${phone} | Temp Password: ${password} — Please change your password on first login.`);
  } catch (err) {
    console.warn("[Admin Owner Identity] SMS notification failed (non-fatal):", err.message);
  }

  if (email && email.trim()) {
    try {
      const content = emailTemplate(password, ownerName);
      await emailFn(email, "Auto Generated Password", content);
    } catch (err) {
      console.warn("[Admin Owner Identity] Email notification failed (non-fatal):", err.message);
    }
  }
}

module.exports = {
  prepareOwnerIdentity,
  createUnnotifiedUser,
  addOwnerRoleToExistingUser,
  rollbackUserIdentity,
  notifyNewOwnerCredentials,
};
