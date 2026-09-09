"use strict";
const Cashback = require("../../models/bookingCashbackJobModel");
const Push = require("../../models/bookingNotificationJobModel");
const Notification = require("../../models/localNotificationModel");
const User = require("../../models/userModel");
const logger = require("../../utils/logger");
const { enqueueBookingConfirmed } = require("../modules/notifications/outbox/booking-sms.service");
async function recordBookingFollowups(booking, session) {
  await Cashback.create([{ _id: booking._id, userId: booking.userId, baseTicketPrice: booking.originalAmount }], { session });
  await Notification.create([{ _id: booking._id, user: booking.userId, type: "BOOKING_CONFIRMED",
    title: "Ticket Booked Successfully", message: `Your ticket (${booking.ticketId}) is confirmed.`,
    recipientRole: "passenger", meta: { ticketId: booking.ticketId, scheduleId: booking.tripId,
      seats: booking.seats, originalAmount: booking.originalAmount, discountAmount: booking.discountAmount,
      finalAmount: booking.totalAmount, smMoneyUsed: booking.smMoneyUsed, gatewayAmount: booking.gatewayAmount,
      couponCode: booking.couponCode },
  }], { session });
  await Push.create([{ _id: booking._id, userId: booking.userId, ticketId: booking.ticketId }], { session });
  const user = await User.findById(booking.userId).select("phone").session(session).lean();
  if (user?.phone) await enqueueBookingConfirmed({ booking, phone: user.phone }, { session });
  else logger.warn("Booking SMS skipped because the passenger has no phone", {
    bookingId: String(booking._id), userId: String(booking.userId),
  });
}
module.exports = { recordBookingFollowups };
