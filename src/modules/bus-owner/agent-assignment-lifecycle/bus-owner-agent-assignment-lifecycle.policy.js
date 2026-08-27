'use strict';

const { ASSIGNMENT_STATUSES } = require('../../../shared/identity/agent-assignment-status');

const REVOKABLE_STATUSES = Object.freeze([
  ASSIGNMENT_STATUSES.INVITED,
  ASSIGNMENT_STATUSES.ACTIVE,
  ASSIGNMENT_STATUSES.SUSPENDED,
]);

const listFilter = ({ ownerId, brandId, status }) => ({
  ownerId,
  ...(brandId ? { operatorId: brandId } : {}),
  ...(status ? { status } : {}),
});

const transitionFilter = ({ ownerId, assignmentId, action }) => {
  return {
    _id: assignmentId,
    ownerId,
    // T1: reinstate is SUSPENDED-only. The transition table also permits the
    // agent's INVITED→ACTIVE accept, so it is never an authorization gate here.
    status: action === 'revoke'
      ? { $in: [...REVOKABLE_STATUSES] }
      : action === 'suspend' ? ASSIGNMENT_STATUSES.ACTIVE : ASSIGNMENT_STATUSES.SUSPENDED,
  };
};

const transitionUpdate = ({ action, ownerId, note, now }) => {
  if (action === 'suspend') {
    return { status: ASSIGNMENT_STATUSES.SUSPENDED, suspendedAt: now, operatorNote: note };
  }
  if (action === 'reinstate') return { status: ASSIGNMENT_STATUSES.ACTIVE };
  return {
    status: ASSIGNMENT_STATUSES.REVOKED,
    revokedAt: now,
    revokedBy: ownerId,
    operatorNote: note,
  };
};

module.exports = {
  REVOKABLE_STATUSES,
  listFilter,
  transitionFilter,
  transitionUpdate,
};
