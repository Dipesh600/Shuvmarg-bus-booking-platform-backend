"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFinancialOverviewService,
} = require("../../src/modules/admin/financial-overview/financial-overview.service");
const timePolicy = require(
  "../../src/modules/admin/financial-overview/time-window.policy"
);

function method(calls, name, result = []) {
  return (...args) => {
    calls.push([name, ...args]);
    return Promise.resolve(result);
  };
}

test("service loads all legacy sources and maps one overview", async () => {
  const calls = [];
  const booking = {
    thisMonth: method(calls, "thisMonth"),
    lastMonth: method(calls, "lastMonth"),
    allTime: method(calls, "allTime"),
    statusDistribution: method(calls, "statusDistribution"),
    couponImpact: method(calls, "couponImpact"),
    gatewayBreakdown: method(calls, "gatewayBreakdown"),
    operatorLeaderboard: method(calls, "operatorLeaderboard"),
    monthlyBookings: method(calls, "monthlyBookings"),
    countAll: method(calls, "countAll", 10),
    countCancelled: method(calls, "countCancelled", 2),
  };
  const settlement = {
    paidAllTime: method(calls, "paidAllTime"),
    paidThisMonth: method(calls, "paidThisMonth"),
    paidLastMonth: method(calls, "paidLastMonth"),
    pending: method(calls, "pending"),
    monthly: method(calls, "monthlyCommission"),
    queue: method(calls, "queue"),
    averageRate: method(calls, "averageRate"),
  };
  const refund = {
    liability: method(calls, "liability"),
    statistics: method(calls, "statistics"),
    monthly: method(calls, "monthlyRefunds"),
  };
  let mapped;
  const now = new Date(2026, 6, 29, 12);
  const service = createFinancialOverviewService({
    bookingRepository: booking,
    settlementRepository: settlement,
    refundRepository: refund,
    timePolicy,
    mapOverview(data, window, timestamp) {
      mapped = { data, window, timestamp };
      return { result: true };
    },
    clock: {
      now: () => now,
      timestamp: () => 12345,
    },
  });

  assert.deepEqual(await service("3"), { result: true });
  assert.equal(calls.length, 20);
  assert.deepEqual(
    calls.slice(0, 18).map(([name]) => name),
    [
      "thisMonth", "lastMonth", "allTime", "paidAllTime",
      "paidThisMonth", "paidLastMonth", "pending", "liability",
      "statistics", "statusDistribution", "couponImpact",
      "gatewayBreakdown", "operatorLeaderboard", "monthlyBookings",
      "monthlyCommission", "monthlyRefunds", "queue", "averageRate",
    ]
  );
  assert.deepEqual(
    calls.slice(18).map(([name]) => name),
    ["countAll", "countCancelled"]
  );
  assert.equal(mapped.data.totalBookingsCount, 10);
  assert.equal(mapped.data.cancelledCount, 2);
  assert.equal(mapped.window.chartMonths, 3);
  assert.equal(mapped.timestamp, 12345);
});
