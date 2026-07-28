'use strict';

const toDashboardResponse = (agent) => ({
  success: true,
  data: {
    commissionBalance: agent.commissionBalance,
    totalOnlineBookings: agent.totalOnlineBookings,
    totalCashBookings: agent.totalCashBookings,
    totalCommissionEarned: agent.totalCommissionEarned,
    totalCommissionSettled: agent.totalCommissionSettled,
    lastBookingAt: agent.lastBookingAt,
    commissionRate: agent.commissionRate,
    agentType: agent.agentType,
  },
});

module.exports = {
  toDashboardResponse,
};
