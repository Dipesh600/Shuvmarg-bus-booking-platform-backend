"use strict";

const { createChartBuckets } = require("./time-window.policy");

function mapMonthlyChart(data, window) {
  const chart = createChartBuckets(window);
  for (const booking of data.monthlyBookings || []) {
    const bucket = chart.get(
      `${booking._id.year}-${booking._id.month}`
    );
    if (bucket) {
      Object.assign(bucket, {
        gbv: Math.round(booking.gbv),
        bookings: booking.bookings,
        discount: Math.round(booking.discount || 0),
      });
    }
  }
  for (const commission of data.monthlyCommission || []) {
    const bucket = chart.get(
      `${commission._id.year}-${commission._id.month}`
    );
    if (bucket) {
      bucket.commission = Math.round(commission.commission);
    }
  }
  for (const refund of data.monthlyRefunds || []) {
    const bucket = chart.get(`${refund._id.year}-${refund._id.month}`);
    if (bucket) bucket.refunds = Math.round(refund.refunds);
  }
  return Array.from(chart.values());
}

module.exports = { mapMonthlyChart };
