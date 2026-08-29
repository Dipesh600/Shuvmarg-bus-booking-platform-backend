'use strict';

const { toAssignmentTerms } = require('../../../shared/identity/agent-assignment-terms-mapper');
const { displayAgentCode } = require('../../../shared/identity/agent-code-lookup');
const { outletTypeOf } = require('../../../shared/identity/agent-enums');
const {
  effectiveKycStatus,
  hasVerifiedBadge,
} = require('../../../shared/identity/agent-assignability');

const toAgent = (agent) => {
  const kycStatus = effectiveKycStatus(agent);
  return {
    agentCode: displayAgentCode(agent),
    name: agent?.user?.name || null,
    outletType: outletTypeOf(agent),
    businessName: agent?.businessName || null,
    district: agent?.district || null,
    municipality: agent?.municipality || null,
    kycStatus,
    isVerified: hasVerifiedBadge(agent, kycStatus),
  };
};

/** Explicit operator view: no agent contact, identity documents or other owners. */
const idOf = (value) => String(value?._id || value || '');

const effectiveStatus = (assignment, now) => assignment.status === 'INVITED'
  && assignment.expiresAt && new Date(assignment.expiresAt).getTime() <= now.getTime()
  ? 'EXPIRED' : assignment.status;

const toAssignment = (assignment, salesCount, now = new Date()) => {
  const status = effectiveStatus(assignment, now);
  const stateContext = status === 'SUSPENDED'
    ? { suspendedAt: assignment.suspendedAt || null, operatorNote: assignment.operatorNote || null }
    : status === 'REVOKED'
      ? { revokedAt: assignment.revokedAt || null, operatorNote: assignment.operatorNote || null }
      : {};

  return {
    assignmentId: assignment._id,
    status,
    invitedAt: assignment.invitedAt || null,
    expiresAt: assignment.expiresAt || null,
    acceptedAt: assignment.acceptedAt || null,
    declinedAt: assignment.declinedAt || null,
    ...(salesCount === undefined ? {} : { salesCount }),
    statusReason: assignment.statusReason || null,
    // Suspension context remains stored for audit, but is current-state data. An
    // ACTIVE row must not read as if its old suspension is still in force.
    ...stateContext,
    agent: toAgent(assignment.agentId),
    brand: {
      id: assignment.operatorId?._id || assignment.operatorId || null,
      name: assignment.operatorId?.brandName || null,
    },
    ...toAssignmentTerms(assignment),
  };
};

const toListResponse = ({ rows, total, page, limit, salesCounts = new Map(), now = new Date() }) => ({
  success: true,
  data: rows.map((row) => toAssignment(
    row,
    salesCounts.get(`${idOf(row.agentId)}:${idOf(row.operatorId)}`) || 0, now,
  )),
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  },
});

const PAST_TENSE = Object.freeze({
  suspend: 'suspended',
  reinstate: 'reinstated',
  revoke: 'revoked',
});

const toTransitionResponse = (assignment, action) => ({
  success: true,
  message: `Assignment ${PAST_TENSE[action]} successfully.`,
  data: toAssignment(assignment),
});

module.exports = {
  toAssignment,
  toListResponse,
  toTransitionResponse,
};
