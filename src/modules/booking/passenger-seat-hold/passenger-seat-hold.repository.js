'use strict';

/**
 * src/modules/booking/passenger-seat-hold/passenger-seat-hold.repository.js
 *
 * Database access layer for SeatHold model.
 */

const SeatHold = require('../../../../models/seatHoldModel');

const deleteExpiredConflicts = async (userTripKey, seatKeys, userId, tripId, now = new Date()) => {
  return SeatHold.deleteMany({
    status: 'held',
    expiresAt: { $lte: now },
    $or: [
      { userTripKey },
      { seatKeys: { $in: seatKeys } },
      {
        userId,
        tripId,
        $or: [{ userTripKey: { $exists: false } }, { userTripKey: null }],
      },
    ],
  });
};

const findActiveHoldForUserTrip = async (userId, tripId, userTripKey, now = new Date()) => {
  return SeatHold.findOne({
    status: 'held',
    expiresAt: { $gt: now },
    $or: [{ userTripKey }, { userId, tripId }],
  }).select('+seatKeys +userTripKey');
};

const findActiveLegacyConflicts = async (tripId, seatNumbers, currentUserId, now = new Date()) => {
  return SeatHold.find({
    tripId,
    seatNumbers: { $in: seatNumbers },
    status: 'held',
    expiresAt: { $gt: now },
    userId: { $ne: currentUserId },
    $or: [{ seatKeys: { $exists: false } }, { seatKeys: { $size: 0 } }],
  }).select('+seatKeys +userTripKey');
};

const createHold = async (data) => {
  const [doc] = await SeatHold.create([data]);
  return doc;
};

const updateOwnedActiveHold = async (holdId, userId, tripId, normalizedSeats, seatKeys, userTripKey, now = new Date()) => {
  return SeatHold.findOneAndUpdate(
    {
      _id: holdId,
      userId,
      tripId,
      status: 'held',
      expiresAt: { $gt: now },
    },
    {
      $set: {
        seatNumbers: normalizedSeats,
        seatKeys,
        userTripKey,
      },
    },
    { new: true, runValidators: true }
  ).select('+seatKeys +userTripKey');
};

const findOwnedActiveHoldByTempId = async (tempBookingId, userId, now = new Date()) => {
  return SeatHold.findOne({
    tempBookingId,
    userId,
    status: 'held',
    expiresAt: { $gt: now },
  }).select('+seatKeys +userTripKey');
};

const completeOwnedHold = async (holdId, userId, now = new Date()) => {
  return SeatHold.updateOne(
    {
      _id: holdId,
      userId,
      status: 'held',
    },
    {
      $set: {
        status: 'completed',
        completedAt: now,
      },
      $unset: {
        seatKeys: '',
        userTripKey: '',
      },
    }
  );
};

module.exports = {
  deleteExpiredConflicts,
  findActiveHoldForUserTrip,
  findActiveLegacyConflicts,
  createHold,
  updateOwnedActiveHold,
  findOwnedActiveHoldByTempId,
  completeOwnedHold,
};
