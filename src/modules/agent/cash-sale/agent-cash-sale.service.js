'use strict';

const sameId = (left, right) => String(left?._id || left) === String(right?._id || right);

const mapDataError = (error, errors) => {
  if (error.name === 'ValidationError') throw errors.invalidInput(
    Object.values(error.errors || {}).map((item) => item.message),
  );
  if (error.code === 11000) throw errors.dataConflict();
  throw error;
};

const createAgentCashSaleService = (deps) => {
  const commitSale = async (userId, body) => {
    const input = deps.parse.parseSale(body);
    if (input.errors.length) throw deps.errors.invalidInput(input.errors);
    const agent = await deps.repository.findAgentForUser(userId);
    if (!agent) throw deps.errors.noApplication();
    const now = deps.clock();
    const hold = await deps.repository.claimOwnedAgentHold(input.value.holdId, userId, now);
    if (!hold) {
      const state = await deps.repository.findOwnedHoldState(input.value.holdId, userId);
      if (state) throw deps.errors.conflict();
      throw deps.errors.holdNotFound();
    }

    const state = { hold, userId, seatsLocked: false, agentBookingCreated: false, bookingCreated: false };
    try {
      const trip = await deps.repository.findTripContext(hold.tripId);
      if (!trip || !sameId(trip.brandId, hold.authorizedBrandId)) throw deps.errors.scopeChanged();
      state.seatsLocked = true;
      const lock = await deps.seatCommitment.commitPassengerSeats({
        scheduleId: hold.tripId,
        userId,
        seatNumbers: hold.seatNumbers,
        transactionId: String(hold._id),
      });
      if (!lock.ok) throw deps.errors.seatConflict();
      const bookingId = deps.createId();
      const agentBookingId = deps.createId();
      state.agentBookingId = agentBookingId;
      const agentBookingPayload = deps.mapper.toAgentBooking(input.value, {
        agentId: agent._id,
        agentBookingId,
        bookingId,
      });
      await deps.repository.createAgentBooking(agentBookingPayload);
      state.agentBookingCreated = true;
      const { booking } = await deps.bookingPersistence.persistAgentCashBooking({
        ...input.value,
        agentId: agent._id,
        agentBookingId,
        bookingId,
        holdId: hold._id,
        originalAmount: hold.originalAmount,
        seatNumbers: hold.seatNumbers,
        trip,
        userId,
      });
      state.bookingCreated = true;
      await deps.passengerSeatHold.completePassengerHold({ holdId: hold._id, userId, now: deps.clock() });
      return { statusCode: 200, responseBody: deps.mapper.toResponse({ booking, hold, trip, input: input.value }) };
    } catch (error) {
      if (!state.bookingCreated) await deps.compensate(deps, state);
      mapDataError(error, deps.errors);
    }
  };
  return { commitSale };
};

module.exports = { createAgentCashSaleService };
