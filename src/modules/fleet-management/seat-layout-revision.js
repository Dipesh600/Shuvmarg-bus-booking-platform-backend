"use strict";

const Fleet = require("../../../models/fleetModel");
const Schedule = require("../../../models/scheduleModel");
const Trip = require("../../../models/tripModel");
const Booking = require("../../../models/bookTicketModel");
const SeatHold = require("../../../models/seatHoldModel");
const Seat = require("../../../models/seatsModel");
const Revision = require("../../../models/fleetSeatLayoutRevisionModel");
const Version = require("../../../models/seatLayoutVersionModel");
const versions = require("../../../services/seatLayoutVersionService");
const { createConflictService } = require("./seat-layout-revision.conflicts");
const { createSeatLayoutRevisionService } = require("./seat-layout-revision.service");
const { createRevisionActivationService } = require("./seat-layout-revision.activation");
const { createTripRebaseService } = require("./seat-layout-revision.trip-rebase");

const tripRebase = createTripRebaseService({ Trip, Seat });

const dependencies = {
  Fleet,
  Schedule,
  Revision,
  Version,
  versions,
  conflicts: createConflictService({ Trip, Booking, SeatHold, Seat }),
  tripRebase,
};

module.exports = {
  ...createSeatLayoutRevisionService(dependencies),
  ...createRevisionActivationService({ Fleet, Schedule, Revision, Version, tripRebase }),
};
