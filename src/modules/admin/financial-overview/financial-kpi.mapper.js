"use strict";

function mapFinancialKpis(data, metrics) {
  return {
    gbv: {
      allTime: Math.round(metrics.gbvAll),
      thisMonth: Math.round(metrics.gbvTM),
      lastMonth: Math.round(metrics.gbvLM),
      momDelta: metrics.gbvDelta,
      totalBookings: data.gbvAllTime?.[0]?.count || 0,
      totalDiscount: Math.round(data.gbvAllTime?.[0]?.discount || 0),
      totalSeats: data.gbvAllTime?.[0]?.seats || 0,
      avgTicket: Math.round(data.gbvAllTime?.[0]?.avgTicket || 0),
      thisMonthCount: data.gbvThisMonth?.[0]?.count || 0,
      thisMonthSeats: data.gbvThisMonth?.[0]?.seats || 0,
      thisMonthDiscount: Math.round(
        data.gbvThisMonth?.[0]?.discount || 0
      ),
    },
    netRevenue: {
      allTime: Math.round(metrics.netAll),
      thisMonth: Math.round(metrics.netTM),
      lastMonth: Math.round(metrics.netLM),
      momDelta: metrics.netDelta,
      paidCount: data.commissionPaid?.[0]?.count || 0,
      grossSettled: Math.round(
        data.commissionPaid?.[0]?.grossPaid || 0
      ),
    },
    takeRate: {
      allTime: metrics.takeRateAll,
      thisMonth: metrics.takeRateTM,
      isEstimated: metrics.takeRateTMIsEstimated,
      avgRate: parseFloat(metrics.avgRate.toFixed(2)),
    },
    pendingSettlements: {
      amount: Math.round(data.pendingSettl?.[0]?.amount || 0),
      count: data.pendingSettl?.[0]?.count || 0,
      pending: data.pendingSettl?.[0]?.pending || 0,
      processing: data.pendingSettl?.[0]?.processing || 0,
    },
    refundLiability: {
      amount: Math.round(data.refundLiability?.[0]?.amount || 0),
      count: data.refundLiability?.[0]?.count || 0,
    },
    refundHealth: {
      totalPaid: Math.round(metrics.refundPaidTotal),
      totalPaidCount: data.refundStats?.[0]?.totalPaidCount || 0,
      cancellationIncome: Math.round(
        data.refundStats?.[0]?.cancellationCharges || 0
      ),
      refundRate: metrics.refundRate,
    },
    transactionSuccessRate: metrics.successRate,
  };
}

module.exports = { mapFinancialKpis };
