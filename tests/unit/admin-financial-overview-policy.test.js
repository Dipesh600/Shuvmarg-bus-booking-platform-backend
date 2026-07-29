"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createTimeWindow,
  normalizeChartMonths,
} = require("../../src/modules/admin/financial-overview/time-window.policy");
const {
  calculateFinancialMetrics,
} = require("../../src/modules/admin/financial-overview/financial-metrics.policy");

test("chart month input preserves legacy clamping and default", () => {
  assert.equal(normalizeChartMonths(undefined), 12);
  assert.equal(normalizeChartMonths("bad"), 12);
  assert.equal(normalizeChartMonths("0"), 12);
  assert.equal(normalizeChartMonths("-2"), 1);
  assert.equal(normalizeChartMonths("3"), 3);
  assert.equal(normalizeChartMonths("25"), 24);
});

test("time window preserves local month boundaries", () => {
  const window = createTimeWindow(
    3,
    new Date(2026, 6, 29, 12, 30, 0)
  );
  assert.deepEqual(window.thisMonthStart, new Date(2026, 6, 1));
  assert.deepEqual(window.lastMonthStart, new Date(2026, 5, 1));
  assert.deepEqual(
    window.lastMonthEnd,
    new Date(new Date(2026, 6, 1).getTime() - 1)
  );
  assert.deepEqual(window.chartWindowStart, new Date(2026, 4, 1));
});

test("metrics preserve deltas, real take rate, and refund health", () => {
  const metrics = calculateFinancialMetrics({
    gbvThisMonth: [{ gbv: 1200 }],
    gbvLastMonth: [{ gbv: 1000 }],
    gbvAllTime: [{ gbv: 10000 }],
    commissionThisMonth: [{ total: 120 }],
    commissionLastMonth: [{ total: 100 }],
    commissionPaid: [{ total: 900 }],
    avgCommissionRate: [{ avgRate: 11 }],
    refundStats: [{ totalPaid: 250 }],
    totalBookingsCount: 20,
    cancelledCount: 2,
  });
  assert.equal(metrics.gbvDelta, 20);
  assert.equal(metrics.netDelta, 20);
  assert.equal(metrics.takeRateAll, 9);
  assert.equal(metrics.takeRateTM, 10);
  assert.equal(metrics.takeRateTMIsEstimated, false);
  assert.equal(metrics.refundRate, 2.5);
  assert.equal(metrics.successRate, 90);
});

test("metrics preserve estimated and empty-state behavior", () => {
  const estimated = calculateFinancialMetrics({
    gbvThisMonth: [{ gbv: 500 }],
    avgCommissionRate: [],
    totalBookingsCount: 0,
  });
  assert.equal(estimated.takeRateTM, 10);
  assert.equal(estimated.takeRateTMIsEstimated, true);
  assert.equal(estimated.gbvDelta, null);
  assert.equal(estimated.netDelta, null);
  assert.equal(estimated.successRate, 0);
});
