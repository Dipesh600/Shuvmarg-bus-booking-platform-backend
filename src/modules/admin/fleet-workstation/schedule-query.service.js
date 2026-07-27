"use strict";

const createScheduleQueryService = ({ Schedule, Trip }) => {
  const list = async (fleetId, todayEnd) => {
    const schedules = await Schedule.find({
      busId: fleetId,
      status: { $in: ["ACTIVE", "SUSPENDED", "DRAFT"] },
    })
      .populate("driverId", "fullName licenseNumber status")
      .populate({
        path: "variantId",
        select: "code name direction corridorId",
        populate: {
          path: "corridorId",
          select: "code originId destinationId",
          populate: [
            { path: "originId", select: "name" },
            { path: "destinationId", select: "name" },
          ],
        },
      })
      .sort({ status: 1, createdAt: -1 })
      .lean();
    for (const schedule of schedules) {
      schedule.tripCount = await Trip.countDocuments({
        scheduleId: schedule._id,
      });
      const nextTrip = await Trip.findOne({
        scheduleId: schedule._id,
        tripDate: { $gt: todayEnd },
        status: "scheduled",
      })
        .sort({ tripDate: 1 })
        .select("tripDate")
        .lean();
      schedule.nextTripDate = nextTrip?.tripDate || null;
    }
    return schedules;
  };
  return { list };
};

module.exports = { createScheduleQueryService };
