'use strict';

const compensate = async (deps, state) => {
  if (state.agentBookingCreated) {
    try { await deps.repository.deleteAgentBooking(state.agentBookingId); } catch (_) { /* best-effort cleanup */ }
  }
  if (state.seatsLocked) {
    await deps.seatCommitment.rollbackPassengerSeatLocks({
      tripId: state.hold.tripId,
      seatNumbers: state.hold.seatNumbers,
      userId: state.userId,
    });
  }
  if (state.hold) {
    await deps.passengerSeatHold.restorePassengerHoldAfterFailedConfirmation({
      holdId: state.hold._id,
      userId: state.userId,
      heldExpiresAt: state.hold.heldExpiresAt || state.hold.expiresAt,
      now: deps.clock(),
    });
  }
};

module.exports = { compensate };
