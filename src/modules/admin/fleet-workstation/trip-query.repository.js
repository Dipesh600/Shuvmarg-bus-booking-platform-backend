"use strict";

const corridorPopulate = {
  path: "variantId",
  select: "code direction",
  populate: {
    path: "corridorId",
    select: "originId destinationId",
    populate: [
      { path: "originId", select: "name" },
      { path: "destinationId", select: "name" },
    ],
  },
};

const createTripQueryRepository = ({ Trip }) => ({
  findToday(fleetId, start, end) {
    return Trip.findOne({
      busId: fleetId,
      tripDate: { $gte: start, $lte: end },
      status: { $ne: "cancelled" },
    })
      .populate("driverId", "fullName phone licenseNumber licenseType status")
      .populate({
        ...corridorPopulate,
        select: "code name direction corridorId",
      })
      .populate("scheduleId", "departureTime arrivalTime operationalModel")
      .lean();
  },

  findNext(fleetId, after) {
    return Trip.findOne({
      busId: fleetId,
      tripDate: { $gt: after },
      status: "scheduled",
    })
      .sort({ tripDate: 1 })
      .select("tripId tripDate departureTime arrivalTime shift")
      .populate(corridorPopulate)
      .lean();
  },

  async findCategories(fleetId, dates) {
    const base = (query, order) =>
      Trip.find(query)
        .populate("driverId", "fullName phone")
        .populate(corridorPopulate)
        .sort({ tripDate: order })
        .lean();
    return Promise.all([
      base(
        {
          busId: fleetId,
          tripDate: { $gt: dates.todayEnd, $lte: dates.thirtyDaysAhead },
          status: { $ne: "cancelled" },
        },
        1
      ),
      base(
        {
          busId: fleetId,
          tripDate: { $gte: dates.thirtyDaysAgo, $lte: dates.todayEnd },
          status: "completed",
        },
        -1
      ),
      base(
        {
          busId: fleetId,
          tripDate: { $gte: dates.thirtyDaysAgo },
          status: "cancelled",
        },
        -1
      ),
      Trip.find({ busId: fleetId })
        .populate("driverId", "fullName phone")
        .populate(corridorPopulate)
        .sort({ tripDate: -1 })
        .limit(200)
        .lean(),
    ]);
  },

  findTimeline(fleetId, after, before) {
    return Trip.find({
      busId: fleetId,
      tripDate: { $gt: after, $lte: before },
    })
      .select(
        "tripId tripDate departureTime arrivalTime status exceptionType scheduleId"
      )
      .sort({ tripDate: 1 })
      .lean();
  },
});

module.exports = { createTripQueryRepository, corridorPopulate };
