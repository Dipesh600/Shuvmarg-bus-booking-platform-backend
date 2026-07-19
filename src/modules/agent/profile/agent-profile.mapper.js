'use strict';

const toProfileResponse = (agent) => ({
  success: true,
  message: 'Agent profile retrieved.',
  data: {
    agentId: agent.agentId,
    agentType: agent.agentType,
    applicationStatus: agent.applicationStatus,
    linkedOperator: agent.linkedOperatorId || null,
    businessName: agent.businessName,
    shopAddress: agent.shopAddress,
    operationType: agent.operationType,
    district: agent.district,
    municipality: agent.municipality,
    commissionRate: agent.commissionRate,
    commissionBalance: agent.commissionBalance,
    minSettlementThreshold: agent.minSettlementThreshold,
    totalOnlineBookings: agent.totalOnlineBookings,
    totalCashBookings: agent.totalCashBookings,
    totalCommissionEarned: agent.totalCommissionEarned,
    totalCommissionSettled: agent.totalCommissionSettled,
    lastBookingAt: agent.lastBookingAt,
    settlementMethod: agent.settlementMethod,
    referralCode: agent.referralCode,
    qrCodeUrl: agent.qrCodeUrl,
    approvedAt: agent.approvedAt,
    createdAt: agent.createdAt,
  },
});

module.exports = {
  toProfileResponse,
};
