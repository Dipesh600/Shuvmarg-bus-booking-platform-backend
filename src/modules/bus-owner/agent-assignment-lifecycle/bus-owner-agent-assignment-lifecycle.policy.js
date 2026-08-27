'use strict';

const {
  ASSIGNMENT_STATUSES,
  LIVE_ASSIGNMENT_STATUSES,
  TERMINAL_ASSIGNMENT_STATUSES,
} = require('../../../shared/identity/agent-assignment-status');

const REVOKABLE_STATUSES = Object.freeze([
  ASSIGNMENT_STATUSES.INVITED,
  ASSIGNMENT_STATUSES.ACTIVE,
  ASSIGNMENT_STATUSES.SUSPENDED,
]);

const currentConditions = (now) => [
  { status: { $in: LIVE_ASSIGNMENT_STATUSES.filter((status) => status !== ASSIGNMENT_STATUSES.INVITED) } },
  { status: ASSIGNMENT_STATUSES.INVITED, expiresAt: null },
  { status: ASSIGNMENT_STATUSES.INVITED, expiresAt: { $gt: now } },
];

const historyConditions = (now) => [
  { status: { $in: TERMINAL_ASSIGNMENT_STATUSES } },
  { status: ASSIGNMENT_STATUSES.INVITED, expiresAt: { $lte: now } },
];

const invitationConditions = () => [{ status: { $in: [
  ASSIGNMENT_STATUSES.INVITED,
  ASSIGNMENT_STATUSES.DECLINED,
  ASSIGNMENT_STATUSES.EXPIRED,
] } }];

const stoppedConditions = () => [{ status: { $in: [
  ASSIGNMENT_STATUSES.SUSPENDED,
  ASSIGNMENT_STATUSES.REVOKED,
] } }];

const statusConditions = (status, now) => status === ASSIGNMENT_STATUSES.INVITED
  ? currentConditions(now).slice(1)
  : status === ASSIGNMENT_STATUSES.EXPIRED ? [
    { status: ASSIGNMENT_STATUSES.EXPIRED },
    { status: ASSIGNMENT_STATUSES.INVITED, expiresAt: { $lte: now } },
  ] : null;

const listFilter = ({ ownerId, brandId, status, view, now = new Date() }) => {
  const conditions = status ? statusConditions(status, now)
    : view === 'CURRENT' ? currentConditions(now)
      : view === 'HISTORY' ? historyConditions(now)
        : view === 'INVITATIONS' ? invitationConditions()
          : view === 'STOPPED' ? stoppedConditions() : null;
  return {
    ownerId,
    ...(brandId ? { operatorId: brandId } : {}),
    ...(status && !conditions ? { status } : {}),
    ...(conditions ? { $or: conditions } : {}),
  };
};

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
