"use strict";
const Job = require("../models/bookingCashbackJobModel");
const ledger = require("../src/modules/wallet/sm-ledger");
const logger = require("../utils/logger");
async function recoverBookingCashback() {
  const jobs = await Job.find({ status: "PENDING", nextAttemptAt: { $lte: new Date() } })
    .sort({ nextAttemptAt: 1 }).limit(100);
  for (const job of jobs) {
    try {
      await ledger.generateCashback({ userId: job.userId, bookingId: job._id, baseTicketPrice: job.baseTicketPrice });
    } catch (error) {
      // Backoff keeps a broken historical record from starving newer bookings.
      await Job.updateOne({ _id: job._id, status: "PENDING" }, {
        $inc: { attempts: 1 }, $set: { nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000) },
      });
      logger.error("Booking cashback requires retry or review", { bookingId: job._id, error: error.message });
    }
  }
}
module.exports = { recoverBookingCashback };
