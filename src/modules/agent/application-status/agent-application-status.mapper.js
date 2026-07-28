'use strict';

const personal = (agent) => ({
  district: agent.district,
  municipality: agent.municipality,
  placeName: agent.placeName,
});

const business = (agent) => ({
  businessName: agent.businessName,
  shopAddress: agent.shopAddress,
  operationType: agent.operationType,
  claimedMonthlyVolume: agent.claimedMonthlyVolume,
  currentOperators: agent.currentOperators,
  referralSource: agent.referralSource,
});

const identification = (agent) => ({
  citizenshipNumber: agent.citizenshipNumber,
  nationalIdNumber: agent.nationalIdNumber,
  panNumber: agent.panNumber,
});

const consents = (agent) => ({
  termsAcceptedAt: agent.termsAcceptedAt,
  whatsappConsent: agent.whatsappConsent,
});

const noApplication = (userName) => ({
  success: true,
  message: 'No application started yet.',
  data: {
    applicationStatus: 'DRAFT',
    hasApplication: false,
    userName: userName || null,
  },
});

const applicationStatus = (agent, documents, reapply) => ({
  success: true,
  message: 'Application status retrieved.',
  data: {
    hasApplication: true,
    agentId: agent.agentId,
    applicationStatus: agent.applicationStatus,
    agentType: agent.agentType,
    submittedAt: agent.submittedAt,
    approvedAt: agent.approvedAt,
    userName: agent.user?.name ?? null,
    personal: personal(agent),
    business: business(agent),
    identification: identification(agent),
    documents,
    consents: consents(agent),
    rejectionReason: agent.rejectionReason,
    moreInfoRequest: agent.moreInfoRequest,
    moreInfoRequestedAt: agent.moreInfoRequestedAt,
    isPermanentlyRejected: agent.isPermanentlyRejected,
    canReapply: reapply.canReapply,
    reapplyAvailableAt: reapply.reapplyAvailableAt,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  },
});

module.exports = {
  noApplication,
  applicationStatus,
};
