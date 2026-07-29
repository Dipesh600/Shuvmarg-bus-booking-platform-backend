"use strict";

function mapPaymentBreakdown(data, gbvAll) {
  const denominator = gbvAll || 1;
  return (data.gatewayRaw || []).map((gateway) => ({
    gateway: gateway._id ?? "unknown",
    count: gateway.count,
    total: Math.round(gateway.total),
    original: Math.round(gateway.original || 0),
    avgTicket: Math.round(gateway.avgTicket || 0),
    volumeShare: parseFloat(
      ((gateway.total / denominator) * 100).toFixed(1)
    ),
    thisMonth: Math.round(gateway.thisMonth || 0),
  }));
}

function mapStatusDistribution(data) {
  const statusMap = {};
  for (const status of data.bookingStatusDist || []) {
    statusMap[status._id] = {
      count: status.count,
      value: Math.round(status.value),
    };
  }
  return statusMap;
}

function mapCouponImpact(data) {
  const coupon = data.couponImpact?.[0];
  const bookingCount = data.gbvAllTime?.[0]?.count || 0;
  const usageRate = bookingCount > 0
    ? parseFloat(
      (((coupon?.couponBookings || 0) / bookingCount) * 100).toFixed(1)
    )
    : 0;
  return {
    bookingsWithCoupon: coupon?.couponBookings || 0,
    discountGiven: Math.round(coupon?.couponDiscount || 0),
    revenueFromCoupon: Math.round(coupon?.couponRevenue || 0),
    couponUsageRate: usageRate,
  };
}

function mapOperators(data, gbvAll) {
  const denominator = gbvAll || 1;
  return (data.operatorLeaderboard || []).map((operator) => ({
    brandId: operator._id,
    brandName: operator.brand?.brandName || "Unknown Brand",
    gbv: Math.round(operator.gbv),
    count: operator.count,
    seats: operator.seats,
    discount: Math.round(operator.discount),
    thisMonth: Math.round(operator.thisMonth || 0),
    share: parseFloat(
      ((operator.gbv / denominator) * 100).toFixed(1)
    ),
    avgTicket: operator.count > 0
      ? Math.round(operator.gbv / operator.count)
      : 0,
  }));
}

function mapSettlementQueue(data, nowMs) {
  return (data.settlementQueue || []).map((settlement) => ({
    _id: settlement._id,
    brandName: settlement.brandId?.brandName || "—",
    ownerName: settlement.ownerId?.name || "—",
    netPayable: Math.round(settlement.netPayableAmount),
    commission: Math.round(settlement.platformCommission),
    commissionRate: settlement.commissionRate || 10,
    grossAmount: Math.round(settlement.grossAmount),
    ticketsSold: settlement.totalTicketsSold,
    status: settlement.status,
    raisedAt: settlement.raisedAt,
    daysAgo: Math.floor(
      (nowMs - new Date(settlement.raisedAt).getTime()) / 86400000
    ),
  }));
}

module.exports = {
  mapCouponImpact,
  mapOperators,
  mapPaymentBreakdown,
  mapSettlementQueue,
  mapStatusDistribution,
};
