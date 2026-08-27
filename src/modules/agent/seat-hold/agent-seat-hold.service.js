'use strict';

const createAuthorizedHold = async (deps, userId, input, seats) => {
  const agent = await deps.repository.findAgentForUser(userId);
  if (!agent) throw deps.errors.noApplication();
  if (!deps.isAgentVerificationCleared(agent)) throw deps.errors.agentNotVerified();

  const now = deps.clock();
  const trip = await deps.repository.findTripCandidate(input.tripId);
  if (!trip) throw deps.errors.notSellable();
  const assignments = await deps.repository.findActiveAssignments(agent._id, trip.brandId);
  const assignment = assignments.find((row) => deps.filterSellableTrips({
    assignment: row,
    trips: [trip],
    now,
  }).length === 1);
  if (!assignment) throw deps.errors.notSellable();

  const [layout, seatDoc] = await Promise.all([
    deps.repository.findLayoutPricing(trip._id),
    deps.repository.findSeatDocument(trip._id),
  ]);
  if (!seatDoc) throw deps.errors.seatUnavailable('Seat data is unavailable for this trip.');
  const classified = deps.preparationPolicy.classifyRequestedSeats(seatDoc, seats);
  const blocked = [...classified.invalidSeats, ...classified.alreadyBookedSeats, ...classified.blockedSeats];
  if (blocked.length) throw deps.errors.seatUnavailable(`Seat ${blocked.join(', ')} is unavailable.`);

  const amount = layout
    ? deps.preparationPolicy.calculateSeatLayoutOriginalAmount(layout, seats)
    : deps.preparationPolicy.calculateAuthoritativeOriginalAmount(trip, seats.length);
  if (!amount.isValid) throw deps.errors.seatUnavailable(amount.responseBody.message);
  const hold = await deps.passengerSeatHold.createOrReusePassengerSeatHold({
    userId,
    tripId: trip._id,
    seatNumbers: seats,
    originalAmount: amount.originalAmount,
    now,
  });
  const authorized = await deps.repository.authorizeHold(
    hold._id, userId, assignment._id, trip.brandId,
  );
  if (!authorized) throw deps.errors.notSellable();
  return { statusCode: 200, responseBody: deps.mapper.toResponse(hold) };
};

const createAgentSeatHoldService = (deps) => ({
  async createHold(userId, body) {
    const input = deps.parse.parseHold(body);
    if (input.errors.length) throw deps.errors.invalidInput(input.errors);
    const seats = deps.passengerSeatHold.normalizeSeatNumbers(input.value.seatNumbers);
    try {
      return await createAuthorizedHold(deps, userId, input.value, seats);
    } catch (error) {
      if (error.name === 'ValidationError') {
        throw deps.errors.invalidInput(Object.values(error.errors || {}).map((item) => item.message));
      }
      if (error.code === 11000) throw deps.errors.seatUnavailable('The hold conflicts with stored data.');
      throw error;
    }
  },
});

module.exports = { createAgentSeatHoldService };
