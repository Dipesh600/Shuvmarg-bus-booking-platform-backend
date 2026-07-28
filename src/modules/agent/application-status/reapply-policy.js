'use strict';

const REAPPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

const calculateReapply = (agent, nowMs) => {
  if (agent.applicationStatus !== 'REJECTED' || agent.isPermanentlyRejected) {
    return { canReapply: false, reapplyAvailableAt: null };
  }

  const elapsed = agent.rejectedAt
    ? nowMs - new Date(agent.rejectedAt).getTime()
    : Infinity;
  const canReapply = elapsed >= REAPPLY_WINDOW_MS;

  return {
    canReapply,
    reapplyAvailableAt: canReapply || !agent.rejectedAt
      ? null
      : new Date(new Date(agent.rejectedAt).getTime() + REAPPLY_WINDOW_MS),
  };
};

module.exports = {
  REAPPLY_WINDOW_MS,
  calculateReapply,
};
