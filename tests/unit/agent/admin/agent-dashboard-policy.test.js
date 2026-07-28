'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../../../../src/modules/agent/admin/dashboard/agent-dashboard.policy');

test('agent dashboard policy maps approved percentage exactly', () => {
  assert.equal(policy.approvedPercentage(2, 5), '40');
  assert.equal(policy.approvedPercentage(1, 3), '33');
  assert.equal(policy.approvedPercentage(0, 0), 0);
});

test('agent dashboard policy builds exact legacy response shape', () => {
  const body = policy.dashboardResponse({
    totalAgents: 7,
    activeAgents: 5,
    approvedAgents: 2,
    pendingAgents: 1,
    rejectedAgents: 1,
    moreInfoAgents: 1,
    suspendedAgents: 1,
    draftAgents: 1,
    defaultAgents: 4,
    operatorLinkedAgents: 3,
  });
  assert.deepEqual(body, {
    success: true,
    data: {
      totalAgents: 5,
      allTimeTotal: 7,
      approvedAgents: '2 (40% of registered)',
      pendingAgents: 1,
      rejectedAgents: 1,
      moreInfoAgents: 1,
      suspendedAgents: 1,
      draftAgents: 1,
      byType: {
        default: 4,
        operatorLinked: 3,
      },
    },
  });
});
