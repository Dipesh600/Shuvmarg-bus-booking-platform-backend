"use strict";

const {
  calculateFinancialMetrics,
} = require("./financial-metrics.policy");
const { mapFinancialKpis } = require("./financial-kpi.mapper");
const {
  mapCouponImpact,
  mapOperators,
  mapPaymentBreakdown,
  mapSettlementQueue,
  mapStatusDistribution,
} = require("./financial-breakdown.mapper");
const { mapMonthlyChart } = require("./financial-chart.mapper");

function mapFinancialOverview(data, window, nowMs = Date.now()) {
  const metrics = calculateFinancialMetrics(data);
  return {
    ...mapFinancialKpis(data, metrics),
    bookingStatusDist: mapStatusDistribution(data),
    couponImpact: mapCouponImpact(data),
    operatorLeaderboard: mapOperators(data, metrics.gbvAll),
    paymentBreakdown: mapPaymentBreakdown(data, metrics.gbvAll),
    monthlyChart: mapMonthlyChart(data, window),
    settlementQueue: mapSettlementQueue(data, nowMs),
    revenue: {
      total: Math.round(metrics.gbvAll),
      totalBookings: data.gbvAllTime?.[0]?.count || 0,
      totalDiscount: Math.round(data.gbvAllTime?.[0]?.discount || 0),
    },
    commission: {
      totalCollected: Math.round(metrics.netAll),
      paidCount: data.commissionPaid?.[0]?.count || 0,
    },
  };
}

module.exports = { mapFinancialOverview };
