'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const manager = require('../../../../controllers/notificationController/notification_manager');
const notifications = require('../../../../src/modules/agent/admin/setup/agent-setup-notification.service');

test('agent setup notifications preserve payloads and non-fatal failures', async () => {
  const calls = [];
  const originalLocal = manager.createLocalNotification;
  manager.createLocalNotification = async (...args) => { calls.push(['local', ...args]); throw new Error('local failed'); };
  try {
    await notifications.notifyOperatorLinkedAgent(
      { name: 'Counter', phone: '9800000000' },
      { user: 'u1', agentId: 'AG1' },
      { dispatchSms: async (input) => { calls.push(['sms', input]); throw new Error('sms failed'); } }
    );
    assert.equal(calls.length, 2);
    assert.equal(calls[0][0], 'sms');
    assert.match(calls[0][1].body, /Welcome to Shuvmarg, Counter!/);
    assert.equal(calls[0][1].messageType, 'AGENT_SETUP_APPROVED');
    assert.deepEqual(calls[1], [
      'local',
      'u1',
      'AGENT_KYC_UPDATE',
      'Welcome to Shuvmarg!',
      'Your agent account is ready. Download the Shuvmarg Partner App to get started.',
      { applicationStatus: 'APPROVED', agentId: 'AG1' },
    ]);
  } finally {
    manager.createLocalNotification = originalLocal;
  }
});
