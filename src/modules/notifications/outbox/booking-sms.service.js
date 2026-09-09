"use strict";

const notificationOutbox = require("./index");
const logger = require("../../../../utils/logger");

const expiry = (days, now = new Date()) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
const amount = (value) => Number(value || 0).toFixed(2).replace(/\.00$/, "");

async function enqueueSafely(outbox, input, options) {
  try {
    return await outbox.enqueueSms(input, options);
  } catch (error) {
    if (error?.code !== "INVALID_SMS_RECIPIENT") throw error;
    logger.warn("SMS notification skipped because the account has an invalid phone", {
      businessReference: input.businessReference,
      userId: input.userId ? String(input.userId) : null,
    });
    return null;
  }
}

async function enqueueBookingConfirmed({ booking, phone }, options = {}) {
  const route = booking.bookedFrom && booking.bookedTo
    ? ` for ${booking.bookedFrom} to ${booking.bookedTo}` : "";
  const outbox = options.outbox || notificationOutbox;
  return enqueueSafely(outbox, {
    messageType: "BOOKING_CONFIRMED",
    idempotencyKey: `booking:${booking._id}:confirmed:1`,
    businessReference: `booking:${booking._id}`,
    recipientPhone: phone,
    body: `Shuvmarg: Ticket ${booking.ticketId} is confirmed${route}. View your ticket in the app.`,
    userId: booking.userId,
    brandId: booking.brandId || null,
    expiresAt: expiry(2),
  }, options);
}

function refundBody({ refund, booking }) {
  const value = amount(refund.refundAmount);
  const ticket = booking?.ticketId || "your booking";
  if (refund.status === "completed") {
    const destination = refund.destination === "wallet" || refund.refundGateway === "yatra_balance"
      ? "SM Money" : "your original payment source";
    return `Shuvmarg: Refund NPR ${value} for ${ticket} is complete in ${destination}. Ref ${refund._id}.`;
  }
  if (refund.status === "processing") {
    return `Shuvmarg: Refund NPR ${value} for ${ticket} is being processed to your original payment source. Ref ${refund._id}.`;
  }
  if (refund.status === "rejected") {
    return `Shuvmarg: Refund NPR ${value} for ${ticket} needs attention. Open the app or contact support. Ref ${refund._id}.`;
  }
  if (!refund.destination) {
    return `Shuvmarg: ${ticket} was cancelled. Choose SM Money or the original payment source for your NPR ${value} refund in the app.`;
  }
  const destination = refund.destination === "wallet" ? "SM Money" : "your original payment source";
  return `Shuvmarg: Refund NPR ${value} for ${ticket} was requested to ${destination}. Ref ${refund._id}.`;
}

async function enqueueBookingCancelled({ booking, refund, phone }, options = {}) {
  const outbox = options.outbox || notificationOutbox;
  await outbox.cancelPendingSms(`booking:${booking._id}`, options);
  await enqueueSafely(outbox, {
    messageType: "BOOKING_CANCELLED",
    idempotencyKey: `booking:${booking._id}:cancelled:1`,
    businessReference: `booking:${booking._id}`,
    recipientPhone: phone,
    body: `Shuvmarg: Ticket ${booking.ticketId} was cancelled. Open the app for refund details.`,
    userId: booking.userId,
    brandId: booking.brandId || null,
    expiresAt: expiry(7),
  }, options);
  if (refund && refund.status !== "not_applicable") {
    await enqueueRefundStatus({ refund, booking, phone }, options);
  }
}

async function enqueueRefundStatus({ refund, booking, phone }, options = {}) {
  const outbox = options.outbox || notificationOutbox;
  return enqueueSafely(outbox, {
    messageType: "REFUND_STATUS",
    idempotencyKey: `refund:${refund._id}:status:${refund.status}:destination:${refund.destination || "unselected"}`,
    businessReference: `refund:${refund._id}`,
    recipientPhone: phone,
    body: refundBody({ refund, booking }),
    userId: refund.userId || booking?.userId,
    brandId: booking?.brandId || null,
    expiresAt: expiry(30),
  }, options);
}

async function enqueueRecoveredPaymentRefund({ attempt, transaction, phone }, options = {}) {
  const outbox = options.outbox || notificationOutbox;
  return enqueueSafely(outbox, {
    messageType: "REFUND_STATUS",
    idempotencyKey: `payment-refund:${attempt._id}:full-refund`,
    businessReference: `payment-attempt:${attempt._id}`,
    recipientPhone: phone,
    body: `Shuvmarg: Payment NPR ${amount(attempt.finalAmount)} was refunded to its original sources. Case ${transaction._id}.`,
    userId: attempt.userId,
    expiresAt: expiry(30),
  }, options);
}

module.exports = { enqueueBookingCancelled, enqueueBookingConfirmed, enqueueRecoveredPaymentRefund,
  enqueueRefundStatus, refundBody };
