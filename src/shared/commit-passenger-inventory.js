'use strict';
const Seat = require('../../models/seatsModel');
const Hold = require('../../models/seatHoldModel');
const Transaction = require('../../models/transactionModel');

async function commitPassengerInventory(payload, { holdId, bookingId, session }) {
  const hold = await Hold.findOne({ _id: holdId, userId: payload.userId, tripId: payload.tripId,
    status: 'processing', expiresAt: { $gt: new Date() } }).session(session);
  const normalize = values => values.map(value => String(value).trim().toLowerCase()).sort();
  const requested = normalize(payload.seats);
  if (!hold || JSON.stringify(normalize(hold.seatNumbers)) !== JSON.stringify(requested)
    || new Set(requested).size !== requested.length || !requested.length) {
    throw new Error('Booking hold is no longer available for these seats');
  }
  const seats = await Seat.findOne({ tripId: payload.tripId }).session(session);
  if (!seats) throw new Error('Seat inventory is unavailable');
  for (const number of requested) {
    const matches = ['seata', 'seatb', 'seatc'].flatMap(field => seats[field]
      .filter(seat => seat.seatNo.trim().toLowerCase() === number));
    if (matches.length !== 1 || matches[0].booked || matches[0].blockedFor !== 'none') {
      throw new Error('A requested seat is unavailable');
    }
    Object.assign(matches[0], { booked: true, bookedBy: payload.userId, bookedAt: new Date() });
  }
  await seats.save({ session });
  hold.status = 'completed'; hold.completedAt = new Date(); hold.seatKeys = undefined; hold.userTripKey = undefined;
  await hold.save({ session });
  const result = await Transaction.updateOne({ transactionId: payload.transactionId, userId: payload.userId,
    status: { $in: ['PAYMENT_RECEIVED', 'PENDING'] } },
  { $set: { status: 'SUCCESS', bookingId, ticketId: payload.ticketId } }, { session });
  if (result.modifiedCount !== 1) throw new Error('Payment transaction is unavailable for booking');
}
module.exports = { commitPassengerInventory };
