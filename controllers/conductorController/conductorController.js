"use strict";

const { createConductorController } = require("../../src/modules/conductor/boarding.controller");
module.exports = createConductorController({
  Booking: require("../../models/bookTicketModel"),
  Trip: require("../../models/tripModel"),
  ConductorProfile: require("../../models/conductorProfileModel"),
  logger: require("../../utils/logger"),
});
