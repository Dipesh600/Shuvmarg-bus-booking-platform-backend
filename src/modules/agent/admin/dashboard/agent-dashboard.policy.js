'use strict';

const approvedPercentage = (approvedAgents, activeAgents) => (
  activeAgents > 0 ? ((approvedAgents / activeAgents) * 100).toFixed(0) : 0
);

const dashboardResponse = (counts) => ({
  success: true,
  data: {
    totalAgents: counts.activeAgents,
    allTimeTotal: counts.totalAgents,
    approvedAgents: `${counts.approvedAgents} (${approvedPercentage(
      counts.approvedAgents,
      counts.activeAgents
    )}% of registered)`,
    pendingAgents: counts.pendingAgents,
    rejectedAgents: counts.rejectedAgents,
    moreInfoAgents: counts.moreInfoAgents,
    suspendedAgents: counts.suspendedAgents,
    draftAgents: counts.draftAgents,
    byType: {
      default: counts.defaultAgents,
      operatorLinked: counts.operatorLinkedAgents,
    },
  },
});

module.exports = {
  approvedPercentage,
  dashboardResponse,
};
