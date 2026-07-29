"use strict";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function normalizeChartMonths(value) {
  return Math.min(24, Math.max(1, parseInt(value, 10) || 12));
}

function monthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function createTimeWindow(value, now = new Date()) {
  const chartMonths = normalizeChartMonths(value);
  const thisMonthStart = monthStart(now);
  const lastMonthStart = monthStart(
    new Date(now.getFullYear(), now.getMonth() - 1, 1)
  );
  const lastMonthEnd = new Date(thisMonthStart.getTime() - 1);
  const chartWindowStart = new Date(now);
  chartWindowStart.setMonth(chartWindowStart.getMonth() - chartMonths + 1);
  chartWindowStart.setDate(1);
  chartWindowStart.setHours(0, 0, 0, 0);
  return {
    now,
    chartMonths,
    thisMonthStart,
    lastMonthStart,
    lastMonthEnd,
    chartWindowStart,
  };
}

function createChartBuckets(window) {
  const buckets = new Map();
  for (let index = 0; index < window.chartMonths; index += 1) {
    const date = new Date(window.chartWindowStart);
    date.setMonth(date.getMonth() + index);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    buckets.set(key, {
      month: `${MONTH_NAMES[date.getMonth()]} ${String(
        date.getFullYear()
      ).slice(2)}`,
      gbv: 0,
      commission: 0,
      refunds: 0,
      bookings: 0,
      discount: 0,
    });
  }
  return buckets;
}

module.exports = {
  createChartBuckets,
  createTimeWindow,
  normalizeChartMonths,
};
