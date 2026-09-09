'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const repository = require('../../../src/modules/bus-owner/agent-invite/bus-owner-agent-invite.repository');
const outbox = require('../../../src/modules/notifications/outbox');
const operations = require('../../../src/modules/bus-owner/agent-invite/bus-owner-agent-invitation-operations.service');

const OWNER_ID = '507f1f77bcf86cd799439011';
const AGENT_ID = '507f1f77bcf86cd799439012';
const USER_ID = '507f1f77bcf86cd799439013';

const patch = (target, name, value, restores) => {
  const original = target[name];
  target[name] = value;
  restores.push(() => { target[name] = original; });
};

test('agent invitation operations enforce owner scope and invited-account state', async (t) => {
  await t.test('another owner cannot resend an invitation', async () => {
    const restores = [];
    let dispatched = false;
    patch(repository, 'findOwnedAgent', async () => null, restores);
    patch(outbox, 'dispatchSms', async () => { dispatched = true; }, restores);
    try {
      await assert.rejects(
        operations.resendAgentInvitation(OWNER_ID, AGENT_ID),
        error => error.statusCode === 404,
      );
      assert.equal(dispatched, false);
    } finally { restores.reverse().forEach(restore => restore()); }
  });

  await t.test('active accounts cannot receive activation invitations', async () => {
    const restores = [];
    patch(repository, 'findOwnedAgent', async () => ({ _id: AGENT_ID, user: USER_ID }), restores);
    patch(repository, 'findUserForActivation', async () => ({ _id: USER_ID, status: 'active' }), restores);
    try {
      await assert.rejects(
        operations.resendAgentInvitation(OWNER_ID, AGENT_ID),
        error => error.statusCode === 409,
      );
    } finally { restores.reverse().forEach(restore => restore()); }
  });

  await t.test('resend is idempotent per window and contains no password', async () => {
    const restores = [];
    const calls = [];
    patch(repository, 'findOwnedAgent', async () => ({ _id: AGENT_ID, user: USER_ID }), restores);
    patch(repository, 'findUserForActivation', async () => ({
      _id: USER_ID, name: 'Invited Agent', phone: '9800000000', status: 'invited',
    }), restores);
    patch(outbox, 'cancelPendingSms', async (...args) => calls.push(['cancel', ...args]), restores);
    patch(outbox, 'dispatchSms', async input => {
      calls.push(['dispatch', input]);
      return { status: 'RETRY_SCHEDULED', jobId: 'message-1' };
    }, restores);
    try {
      const result = await operations.resendAgentInvitation(OWNER_ID, AGENT_ID);
      const input = calls.find(call => call[0] === 'dispatch')[1];
      assert.match(input.idempotencyKey, new RegExp(`^agent:${AGENT_ID}:activation:resend:`));
      assert.equal(input.manualReplay.actorId, OWNER_ID);
      assert.match(input.body, /create your password/i);
      assert.doesNotMatch(input.body, /temporary password|temp password/i);
      assert.equal(result.responseBody.data.smsStatus, 'RETRY_SCHEDULED');
    } finally { restores.reverse().forEach(restore => restore()); }
  });

  await t.test('status output never exposes the phone or SMS body', async () => {
    const restores = [];
    patch(repository, 'findOwnedAgent', async () => ({ _id: AGENT_ID, user: USER_ID }), restores);
    patch(outbox, 'findLatestSms', async () => ({
      _id: 'message-1', status: 'FAILED', attempts: 5, maxAttempts: 5,
      recipientPhone: '9800000000', body: 'secret body', lastError: { code: 'TIMEOUT' },
    }), restores);
    try {
      const result = await operations.getAgentInvitationStatus(OWNER_ID, AGENT_ID);
      assert.equal(result.responseBody.data.status, 'FAILED');
      assert.equal(result.responseBody.data.recipientPhone, undefined);
      assert.equal(result.responseBody.data.body, undefined);
    } finally { restores.reverse().forEach(restore => restore()); }
  });
});
