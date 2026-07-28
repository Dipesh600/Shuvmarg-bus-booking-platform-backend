'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const axios = require('axios');

const manager = require('../../../../controllers/notificationController/notification_manager');
const notifications = require('../../../../src/modules/agent/admin/setup/agent-setup-notification.service');

test('agent setup notifications preserve payloads and non-fatal failures', async () => {
  const calls = [];
  const originalPost = axios.post;
  const originalLocal = manager.createLocalNotification;
  const originalToken = process.env.SPARROW_SMS_TOKEN;
  process.env.SPARROW_SMS_TOKEN = crypto.randomBytes(16).toString('hex');
  axios.post = async (_url, payload) => { calls.push(['sms', payload]); throw new Error('sms failed'); };
  manager.createLocalNotification = async (...args) => { calls.push(['local', ...args]); throw new Error('local failed'); };
  try {
    await notifications.notifyOperatorLinkedAgent(
      { name: 'Counter', phone: '9800000000' },
      { user: 'u1', agentId: 'AG1' }
    );
    assert.equal(calls.length, 2);
    assert.equal(calls[0][0], 'sms');
    assert.match(decodeURIComponent(calls[0][1]), /Welcome to Shuvmarg, Counter!/);
    assert.deepEqual(calls[1], [
      'local',
      'u1',
      'AGENT_KYC_UPDATE',
      'Welcome to Shuvmarg!',
      'Your agent account is ready. Download the Shuvmarg Partner App to get started.',
      { applicationStatus: 'APPROVED', agentId: 'AG1' },
    ]);
  } finally {
    axios.post = originalPost;
    manager.createLocalNotification = originalLocal;
    process.env.SPARROW_SMS_TOKEN = originalToken;
  }
});
