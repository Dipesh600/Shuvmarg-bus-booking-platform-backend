'use strict';

const SeatHold = require('../../../../models/seatHoldModel');
const Snapshot = require('../../../../models/tripSeatLayoutSnapshotModel');
const Control = require('../../../../models/tripSeatLayoutControlModel');
const mongoose = require('mongoose');

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

const updateOwnedActiveHold = async (
  holdId, userId, tripId, normalizedSeats, seatKeys,
  userTripKey, originalAmount, now = new Date()
) => {
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
        originalAmount,
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
      status: { $in: ['held', 'processing'] },
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

const releaseOwnedHold = async (tempBookingId, userId, now = new Date()) => {
  return SeatHold.updateOne(
    { tempBookingId, userId, status: 'held' },
    {
      $set: { status: 'released', releasedAt: now },
      $unset: { seatKeys: '', userTripKey: '' },
    }
  );
};

const findTripSeatLayoutAvailability = async (tripId) => {
  if (!mongoose.isValidObjectId(tripId)) return null;
  const [snapshot, control] = await Promise.all([
    Snapshot.findOne({ tripId }).select('layout placeStates').lean(),
    Control.findOne({ tripId }).select('stateOverrides').lean(),
  ]);
  if (!snapshot) return null;
  const states = new Map((snapshot.placeStates || []).map((item) => [item.elementId, item.state]));
  (control?.stateOverrides || []).forEach((item) => states.set(item.elementId, item.state));
  return snapshot.layout.sections.flatMap((section) => section.elements)
    .filter((element) => ['SEAT', 'BERTH'].includes(element.kind))
    .map((element) => ({ label: element.label, state: states.get(element.elementId) || 'OPEN' }));
};

module.exports = {
  deleteExpiredConflicts,
  findActiveHoldForUserTrip,
  findActiveLegacyConflicts,
  createHold,
  updateOwnedActiveHold,
  findOwnedActiveHoldByTempId,
  completeOwnedHold,
  releaseOwnedHold,
  findTripSeatLayoutAvailability,
};
