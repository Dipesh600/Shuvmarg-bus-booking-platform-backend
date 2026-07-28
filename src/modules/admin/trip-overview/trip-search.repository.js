"use strict";

const Trip = require("../../../../models/tripModel");

const findTrips = (query, { skip, limit }) =>
  Trip.find(query)
    .sort({ tripDate: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate("brandId", "brandName brandCode")
    .populate("busId", "busNumber busName totalSeats")
    .populate("ownerId", "name email")
    .populate("driverId", "fullName phone")
    .populate("scheduleId", "departureTime recurrence versionNumber")
    .populate({
      path: "variantId",
      select: "name direction",
      populate: {
        path: "corridorId",
        select: "originCity destinationCity",
        populate: [
          { path: "originId", select: "name" },
          { path: "destinationId", select: "name" },
        ],
      },
    })
    .lean();

const searchTrips = async (query, pageOptions) => {
  const [trips, total] = await Promise.all([
    findTrips(query, pageOptions),
    Trip.countDocuments(query),
  ]);
  return { trips, total };
};

module.exports = { searchTrips };
