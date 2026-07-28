const repository = require("./trip-seat-availability.repository");
const mapper = require("./trip-seat-availability.mapper");
const { createTripSeatAvailabilityService } = require("./trip-seat-availability.service");
const { createTripSeatAvailabilityController } = require("./trip-seat-availability.controller");

const service = createTripSeatAvailabilityService({ repository, mapper });
const getTripSeatAvailability = createTripSeatAvailabilityController(service);

module.exports = {
  getTripSeatAvailability
};
