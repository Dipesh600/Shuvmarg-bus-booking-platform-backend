"use strict";

const bcrypt = require("bcryptjs");
const User = require("../../../../models/userModel.js");
const sendOTP = require("../../../../handlers/sparro-otp.js");
const generatePassword = require("../../../../handlers/passwordGenerator.js");
const emailTemplate = require("../../../../handlers/password-email-template.js");
const emailManager = require("../../../../emailManager/emailManager.js");

const notifyNewOwner = async ({
  phone,
  email,
  userEmail,
  ownerName,
  password,
}) => {
  try {
    await sendOTP(
      phone,
      `Welcome to Sumarg! Your bus owner login: Phone: ${phone} | ` +
        `Temp Password: ${password} — Please change your password on first login.`
    );
  } catch (error) {
    console.warn(
      "[createBusOwnerFull] SMS notification failed (non-fatal):",
      error.message
    );
  }
  if (email && email.trim() !== "") {
    const content = emailTemplate(password, ownerName);
    await emailManager(userEmail, "Auto Generated Password", content).catch(
      (error) => console.log("Email error", error)
    );
  }
};

const findOrCreateOwnerUser = async ({
  ownerName,
  phone,
  email,
  address,
}) => {
  const userEmail = email && email.trim() !== "" ? email.toLowerCase() : null;
  const query = { $or: [{ phone }] };
  if (userEmail) query.$or.push({ email: userEmail });
  const existing = await User.findOne(query);
  if (existing) {
    const roles =
      existing.roles && existing.roles.length > 0
        ? existing.roles
        : [existing.role];
    if (roles.includes("busOwner")) {
      return {
        error: {
          success: false,
          message: "This user is already registered as a bus owner!",
          errorCode: "ROLE_ALREADY_REGISTERED",
        },
      };
    }
    const user = await User.findByIdAndUpdate(
      existing._id,
      {
        $addToSet: { roles: "busOwner" },
        $set: {
          "roleActivatedAt.busOwner": new Date(),
          forcePasswordChange: false,
        },
      },
      { new: true }
    );
    return { user };
  }
  const password = generatePassword(8);
  const data = {
    name: ownerName,
    phone,
    address,
    password: await bcrypt.hash(password, 12),
    gender: "male",
    role: "busOwner",
    roles: ["busOwner"],
    status: "active",
    forcePasswordChange: true,
    roleActivatedAt: { busOwner: new Date() },
  };
  if (userEmail) data.email = userEmail;
  const user = await new User(data).save();
  await notifyNewOwner({
    phone,
    email,
    userEmail,
    ownerName,
    password,
  });
  return { user };
};

module.exports = { findOrCreateOwnerUser };
