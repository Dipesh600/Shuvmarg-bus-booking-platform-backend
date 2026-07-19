'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const repository = require('../../../../src/modules/agent/admin/setup/agent-setup.repository');
const notifications = require('../../../../src/modules/agent/admin/setup/agent-setup-notification.service');
const service = require('../../../../src/modules/agent/admin/setup/agent-setup.service');

const patch = (target, methods) => {
  const originals = {};
  for (const [name, fn] of Object.entries(methods)) {
    originals[name] = target[name];
    target[name] = fn;
  }
  return () => Object.assign(target, originals);
};

test('agent setup service preserves operation ordering', async (t) => {
  await t.test('OPERATOR_LINKED syncs User before save and notifies after save', async () => {
    const order = [];
    const agent = { _id: 'a1', user: 'u1', agentId: 'AG1', save: async () => {} };
    const restoreRepo = patch(repository, {
      findAgentBySetupId: async () => agent,
      isValidLinkedOperatorId: () => true,
      activateUserForOperatorAgent: async () => { order.push('syncUser'); },
      saveAgent: async () => { order.push('saveAgent'); },
      findNotificationUser: async () => { order.push('findUser'); return { name: 'Agent', phone: '9800000000' }; },
    });
    const restoreNotify = patch(notifications, {
      notifyOperatorLinkedAgent: async () => { order.push('notify'); },
    });
    try {
      const result = await service.finalizeAgentSetup({
        adminId: 'admin1',
        data: { id: 'a1', agentType: 'OPERATOR_LINKED', linkedOperatorId: 'op1' },
      });
      assert.equal(result.statusCode, 200);
      assert.deepEqual(order, ['syncUser', 'saveAgent', 'findUser', 'notify']);
      assert.equal(agent.applicationStatus, 'APPROVED');
      assert.equal(agent.approvedBy, 'admin1');
      assert.deepEqual(agent.allowedRouteIds, []);
    } finally {
      restoreRepo();
      restoreNotify();
    }
  });

  await t.test('non-operator setup saves without notifications', async () => {
    const order = [];
    const agent = { _id: 'a1', user: 'u1', agentId: 'AG1', applicationStatus: 'DRAFT' };
    const restoreRepo = patch(repository, {
      findAgentBySetupId: async () => agent,
      saveAgent: async () => { order.push('saveAgent'); },
      findNotificationUser: async () => { order.push('findUser'); },
    });
    const restoreNotify = patch(notifications, {
      notifyOperatorLinkedAgent: async () => { order.push('notify'); },
    });
    try {
      const result = await service.finalizeAgentSetup({ adminId: null, data: { id: 'a1', businessName: 'Shop' } });
      assert.equal(result.statusCode, 200);
      assert.equal(agent.businessName, 'Shop');
      assert.deepEqual(order, ['saveAgent']);
    } finally {
      restoreRepo();
      restoreNotify();
    }
  });
});
