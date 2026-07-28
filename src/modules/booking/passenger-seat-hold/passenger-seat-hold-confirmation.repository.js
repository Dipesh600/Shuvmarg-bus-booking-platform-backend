'use strict';

const SeatHold = require('../../../../models/seatHoldModel');
const {
  PASSENGER_CONFIRMATION_PROCESSING_LEASE_MS,
} = require('./passenger-seat-hold.constants');

const claimOwnedActiveHold = async (
  holdId,
  userId,
  heldExpiresAt,
  now = new Date()
) => {
  const processingExpiresAt = new Date(Math.max(
    new Date(heldExpiresAt).getTime(),
    now.getTime() + PASSENGER_CONFIRMATION_PROCESSING_LEASE_MS
  ));
  return SeatHold.findOneAndUpdate(
    {
      _id: holdId,
      userId,
      status: 'held',
      expiresAt: { $gt: now },
    },
    {
      $set: {
        status: 'processing',
        processingAt: now,
        heldExpiresAt,
        expiresAt: processingExpiresAt,
      },
    },
    { new: true }
  );
};

const restoreOwnedProcessingHold = async (
  holdId,
  userId,
  heldExpiresAt,
  now = new Date()
) => {
  const canRestore = new Date(heldExpiresAt).getTime() > now.getTime();
  return SeatHold.updateOne(
    { _id: holdId, userId, status: 'processing' },
    canRestore
      ? {
          $set: { status: 'held', expiresAt: heldExpiresAt },
          $unset: { processingAt: '', heldExpiresAt: '' },
        }
      : {
          $set: { status: 'released', releasedAt: now },
          $unset: {
            processingAt: '',
            heldExpiresAt: '',
            seatKeys: '',
            userTripKey: '',
          },
        }
  );
};

module.exports = {
  claimOwnedActiveHold,
  restoreOwnedProcessingHold,
};
