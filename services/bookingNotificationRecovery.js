"use strict";
const { randomUUID } = require("node:crypto");
const Job = require("../models/bookingNotificationJobModel");
const Booking = require("../models/bookTicketModel");
const Devices = require("../models/userDeviceInfoModel");
const logger = require("../utils/logger");
async function deliverBookingNotification(id, { send = (...args) => require("../controllers/notificationController/notification_manager").notificationManager(...args) } = {}) {
  const token = randomUUID();
  const job = await Job.findOneAndUpdate({ _id: id, $or: [
    { status: "PENDING", nextAttemptAt: { $lte: new Date() } },
    { status: "SENDING", leaseExpiresAt: { $lte: new Date() } },
  ] }, { $set: { status: "SENDING", leaseToken: token, leaseExpiresAt: new Date(Date.now() + 120000) } }, { new: true });
  if (!job) return;
  const ownership = { _id: id, status: "SENDING", leaseToken: token };
  try {
    const active = await Booking.exists({ _id: id, userId: job.userId, status: "booked" });
    if (!active) { await Job.updateOne(ownership, { $set: { status: "SKIPPED" } }); return; }
    const devices = await Devices.find({ userId: job.userId });
    const tokens = [...new Set(devices.map(device => device.token).filter(Boolean))];
    for (let i = 0; i < tokens.length; i += 500) {
      const result = await send(tokens.slice(i, i + 500), "Ticket Booked Successfully", `Your ticket (${job.ticketId}) is confirmed.`);
      const responses = result?.response?.responses;
      const permanentTokenErrors = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"];
      const hasRetryableFailure = result?.response?.failureCount > 0
        && (!Array.isArray(responses) || responses.length !== tokens.slice(i, i + 500).length
          || responses.some(response => !response.success && !permanentTokenErrors.includes(response.error?.code)));
      if (!result?.success || hasRetryableFailure) throw new Error("Push provider did not confirm all deliveries");
    }
    await Job.updateOne(ownership, { $set: { status: "COMPLETED" }, $unset: { leaseToken: 1, leaseExpiresAt: 1 } });
  } catch (error) {
    await Job.updateOne(ownership, { $set: { status: "PENDING", nextAttemptAt: new Date(Date.now() + 300000) },
      $unset: { leaseToken: 1, leaseExpiresAt: 1 }, $inc: { attempts: 1 } });
    logger.warn("Booking notification queued for retry", { bookingId: id, error: error.message });
  }
}
async function recoverBookingNotifications(options) {
  const jobs = await Job.find({ $or: [{ status: "PENDING", nextAttemptAt: { $lte: new Date() } },
    { status: "SENDING", leaseExpiresAt: { $lte: new Date() } }] }).sort({ nextAttemptAt: 1 }).limit(100);
  for (const job of jobs) await deliverBookingNotification(job._id, options);
}
module.exports = { deliverBookingNotification, recoverBookingNotifications };
