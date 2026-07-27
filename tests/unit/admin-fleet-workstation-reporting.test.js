"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  summarizeManifest,
} = require("../../src/modules/admin/fleet-workstation/manifest.service");
const {
  emptyTripStats,
} = require("../../src/modules/admin/fleet-workstation/booking-statistics.service");
const {
  createDashboardService,
} = require("../../src/modules/admin/fleet-workstation/dashboard.service");
const timePolicy = require("../../src/modules/admin/fleet-workstation/time.policy");

test("manifest summary preserves passenger, revenue, and refund rules", () => {
  const bookings = [
    {
      status: "booked",
      passengerDetails: [{}, {}],
      seats: ["A1"],
      totalAmount: 500,
      boardingConfirmed: true,
    },
    {
      status: "cancelled",
      seats: ["B1"],
      refundId: { refundAmount: 200 },
    },
    { status: "no_show", seats: ["C1"], totalAmount: 300 },
  ];
  assert.deepEqual(summarizeManifest(bookings), {
    totalBookings: 3,
    totalPassengers: 4,
    totalRevenue: 800,
    boardedCount: 1,
    cancelledCount: 1,
    noShowCount: 1,
    refundedAmount: 200,
  });
});

test("empty trip statistics preserve all response fields", () => {
  assert.deepEqual(emptyTripStats(), {
    booked: 0,
    cancelled: 0,
    noShow: 0,
    pending: 0,
    seatsSold: 0,
    revenue: 0,
    boardingConfirmed: 0,
    refundsPending: 0,
  });
});

test("dashboard service preserves the complete response assembly", async () => {
  const calls = [];
  const fleet = {
    _id: "fleet-1",
    totalSeats: 40,
    brandId: { commissionRate: 7 },
  };
  const groups = [[{ _id: "u1" }], [{ _id: "c1" }], [], [{ _id: "r1" }]];
  const service = createDashboardService({
    fleetRepository: {
      findFleet: async () => fleet,
      findAssignedDriver: async () => ({ _id: "driver-1" }),
    },
    tripRepository: {
      findToday: async () => null,
      findNext: async () => ({ _id: "next-1" }),
      findCategories: async () => groups,
      findTimeline: async () => [{ _id: "timeline-1" }],
    },
    scheduleService: { list: async () => [{ _id: "schedule-1" }] },
    bookingStatistics: {
      aggregateTodayStats: async () => null,
      attachTripStats: async (input) => calls.push(input),
    },
    financialService: { summarize: async () => ({ commissionRate: 7 }) },
    timePolicy,
    clock: () => new Date("2026-07-27T12:00:00Z"),
  });
  const result = await service.getDashboard("fleet-1");
  assert.equal(result.fleet, fleet);
  assert.equal(result.today.trip, null);
  assert.equal(result.today.nextTrip._id, "next-1");
  assert.deepEqual(result.upcomingTrips, groups[0]);
  assert.equal(result.financials.commissionRate, 7);
  assert.equal(result.crew.assignedDriver._id, "driver-1");
  assert.equal(calls[0].totalSeats, 40);
  assert.deepEqual(calls[0].tripGroups, groups);
});
