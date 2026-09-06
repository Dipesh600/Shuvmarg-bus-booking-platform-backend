"use strict";
const Booking = require("../../models/bookTicketModel");
const Refund = require("../../models/refundModel");
const { toMinorUnits } = require("./money");

async function createBudgetedRefund(data, session) {
  if (!session?.inTransaction()) throw new Error("Refund creation requires an active transaction");
  const booking = await Booking.findById(data.bookingId).session(session);
  if (!booking || String(booking.userId) !== String(data.userId)) throw new Error("Refund booking ownership mismatch");
  const paidMinor = toMinorUnits(booking.totalAmount);
  const requestedMinor = toMinorUnits(data.refundAmount);
  let reservedMinor = booking.refundReservedMinor;
  if (reservedMinor === null || reservedMinor === undefined) {
    // Bootstrap historical reservations without assuming that old records are clean.
    const existing = await Refund.find({ bookingId: booking._id,
      status: { $nin: ["rejected", "not_applicable"] } }).select("refundAmount").session(session);
    reservedMinor = existing.reduce((sum, row) => sum + toMinorUnits(row.refundAmount), 0);
  }
  if (!Number.isSafeInteger(reservedMinor) || reservedMinor < 0 || reservedMinor + requestedMinor > paidMinor) {
    throw new Error("Cumulative refund exceeds the recorded payment; reconciliation is required");
  }
  // Updating the booking serializes all refund reservations, including partial refunds.
  await Booking.updateOne({ _id: booking._id }, {
    $set: { refundReservedMinor: reservedMinor + requestedMinor },
  }, { session });
  const [refund] = await Refund.create([{ ...data,
    operationKey: data.operationKey || `cancel:${booking._id}` }], { session });
  return refund;
}

module.exports = { createBudgetedRefund };
