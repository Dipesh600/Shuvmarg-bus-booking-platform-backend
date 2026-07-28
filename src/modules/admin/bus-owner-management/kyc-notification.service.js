"use strict";

const UserDeviceInfo = require("../../../../models/userDeviceInfoModel.js");
const emailManager = require("../../../../emailManager/emailManager.js");
const sendOTP = require("../../../../handlers/sparro-otp.js");
const generateStatusEmail = require("../../../../handlers/busOwnerStatusEmailTemp.js");
const {
  notificationManager,
  createLocalNotification,
} = require("../../../../controllers/notificationController/notification_manager.js");

const sendEmail = async (user, status, documents) => {
  if (!user?.email) return;
  try {
    await emailManager(
      user.email,
      "Bus Owner KYC Update",
      generateStatusEmail(user.name, status, documents)
    );
  } catch (error) {
    console.warn(
      "[updateBusOwnerKyc] Email notification failed (non-fatal):",
      error.message
    );
  }
};

const sendSms = async (user, status, documents) => {
  if (!user?.phone) return;
  try {
    let message = `Dear ${user.name || "Bus Owner"}, your KYC status is ${status}.`;
    if (documents.length > 0) {
      message += ` Invalid documents: ${documents
        .map(({ label }) => label)
        .join(", ")}.`;
    }
    await sendOTP(user.phone, message);
  } catch (error) {
    console.warn(
      "[updateBusOwnerKyc] SMS notification failed (non-fatal):",
      error.message
    );
  }
};

const sendPush = async (owner, status, documents) => {
  try {
    const title = "Bus Owner KYC Updated";
    const body =
      documents.length > 0
        ? `Status: ${status}. Some documents need attention.`
        : `Status: ${status}.`;
    if (!owner.user) return;
    await createLocalNotification(
      owner.user,
      "BUS_OWNER_KYC_UPDATE",
      title,
      body,
      { verificationStatus: status }
    );
    const devices = await UserDeviceInfo.find({ userId: owner.user });
    const tokens = devices.map(({ token }) => token).filter(Boolean);
    if (tokens.length > 0) await notificationManager(tokens, title, body);
  } catch (error) {
    console.error("Bus owner KYC notification error:", error);
  }
};

const notifyKycResult = async ({ owner, user, status, documents }) => {
  await sendEmail(user, status, documents);
  await sendSms(user, status, documents);
  await sendPush(owner, status, documents);
};

module.exports = { notifyKycResult };
