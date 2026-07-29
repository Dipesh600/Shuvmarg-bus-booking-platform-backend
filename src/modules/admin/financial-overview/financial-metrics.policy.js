"use strict";

function percentDelta(current, previous, precision) {
  if (previous <= 0) return null;
  return parseFloat(
    (((current - previous) / previous) * 100).toFixed(precision)
  );
}

function calculateFinancialMetrics(data) {
  const gbvTM = data.gbvThisMonth?.[0]?.gbv || 0;
  const gbvLM = data.gbvLastMonth?.[0]?.gbv || 0;
  const gbvAll = data.gbvAllTime?.[0]?.gbv || 0;
  const netTM = data.commissionThisMonth?.[0]?.total || 0;
  const netLM = data.commissionLastMonth?.[0]?.total || 0;
  const netAll = data.commissionPaid?.[0]?.total || 0;
  const avgRate = data.avgCommissionRate?.[0]?.avgRate ?? 10;
  const takeRateAll = gbvAll > 0
    ? parseFloat(((netAll / gbvAll) * 100).toFixed(2))
    : 0;
  let takeRateTM = 0;
  let takeRateTMIsEstimated = false;

  if (gbvTM > 0 && netTM > 0) {
    takeRateTM = parseFloat(((netTM / gbvTM) * 100).toFixed(2));
  } else if (gbvTM > 0) {
    takeRateTM = parseFloat(avgRate.toFixed(2));
    takeRateTMIsEstimated = true;
  }

  const successRate = data.totalBookingsCount > 0
    ? parseFloat(
      ((data.totalBookingsCount - data.cancelledCount) /
        data.totalBookingsCount * 100).toFixed(2)
    )
    : 0;
  const refundPaidTotal = data.refundStats?.[0]?.totalPaid || 0;
  const refundRate = gbvAll > 0
    ? parseFloat(((refundPaidTotal / gbvAll) * 100).toFixed(2))
    : 0;

  return {
    gbvTM,
    gbvLM,
    gbvAll,
    netTM,
    netLM,
    netAll,
    avgRate,
    takeRateAll,
    takeRateTM,
    takeRateTMIsEstimated,
    successRate,
    refundPaidTotal,
    refundRate,
    gbvDelta: percentDelta(gbvTM, gbvLM, 1),
    netDelta: percentDelta(netTM, netLM, 1),
  };
}

module.exports = { calculateFinancialMetrics, percentDelta };
