'use strict';

const { ASSIGNMENT_STATUSES } = require('../../../shared/identity/agent-assignment-status');

const liveInviteFilter = ({ assignmentId, agentId, now }) => ({
  _id: assignmentId,
  agentId,
  // Literal INVITED is load-bearing. canTransition(SUSPENDED, ACTIVE) is legal
  // for the operator's reinstate path; using it here would let a suspended agent
  // reinstate themselves.
  status: ASSIGNMENT_STATUSES.INVITED,
  // null is an invite with no recorded deadline, not an already-expired invite.
  $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
});

const acceptUpdate = (now) => ({
  status: ASSIGNMENT_STATUSES.ACTIVE,
  acceptedAt: now,
});

const declineUpdate = (now, reason) => ({
  status: ASSIGNMENT_STATUSES.DECLINED,
  declinedAt: now,
  statusReason: reason,
});

const staleInviteFilter = ({ assignmentId, agentId, now }) => ({
  _id: assignmentId,
  agentId,
  status: ASSIGNMENT_STATUSES.INVITED,
  expiresAt: { $lt: now },
});

const isExpiredInvite = (assignment, now) => (
  assignment?.status === ASSIGNMENT_STATUSES.INVITED
  && assignment.expiresAt instanceof Date
  && assignment.expiresAt < now
);

module.exports = {
  acceptUpdate,
  declineUpdate,
  isExpiredInvite,
  liveInviteFilter,
  staleInviteFilter,
};
