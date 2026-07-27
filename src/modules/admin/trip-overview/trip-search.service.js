"use strict";

const {
  pagination,
  buildSearchQuery,
} = require("./trip-overview-query.policy.js");
const { searchTrips: searchRepository } = require("./trip-search.repository.js");
const {
  aggregateBookingStatsMap,
  attachBookingStats,
} = require("./booking-statistics.service.js");

const searchTrips = async (input) => {
  const pageOptions = pagination(input);
  const query = buildSearchQuery(input);
  const { trips, total } = await searchRepository(query, pageOptions);
  const stats = await aggregateBookingStatsMap(trips.map((trip) => trip._id));
  attachBookingStats(trips, stats);
  return {
    trips,
    pagination: {
      total,
      page: pageOptions.page,
      limit: pageOptions.limit,
      totalPages: Math.ceil(total / pageOptions.limit),
    },
  };
};

module.exports = { searchTrips };
