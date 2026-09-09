'use strict';

const mongoose = require('mongoose');

const notificationOutbox = require('../../notifications/outbox');
const errors = require('./bus-owner-agent-invite.errors');
const policy = require('./bus-owner-agent-invite.policy');
const repository = require('./bus-owner-agent-invite.repository');

const replayMessage = (status) => {
  if (['PROVIDER_ACCEPTED', 'DELIVERED'].includes(status)) {
    return 'Activation SMS accepted into the provider queue.';
  }
  if (['FAILED', 'EXPIRED', 'CANCELLED'].includes(status)) {
    return 'Activation SMS could not be sent. You can retry safely.';
  }
  return 'Activation SMS is saved and will retry automatically.';
};

const resendAgentInvitation = async (ownerId, agentId) => {
  if (!mongoose.isValidObjectId(agentId)) throw errors.agentNotFoundError();
  const agent = await repository.findOwnedAgent(ownerId, agentId);
  if (!agent) throw errors.agentNotFoundError();

  const user = await repository.findUserForActivation(agent.user);
  if (!user || user.deletedAt || user.status !== 'invited') {
    throw errors.activationUnavailableError();
  }

  const window = Math.floor(Date.now() / (5 * 60 * 1000));
  const idempotencyKey = `agent:${agent._id}:activation:resend:${window}`;
  const businessReference = `agent:${agent._id}`;
  await notificationOutbox.cancelPendingSms(businessReference, {
    excludeIdempotencyKey: idempotencyKey,
  });
  const delivery = await notificationOutbox.dispatchSms({
    messageType: 'AGENT_INVITATION',
    idempotencyKey,
    businessReference,
    recipientPhone: user.phone,
    body: policy.smsBody({ name: user.name, phone: user.phone }),
    userId: user._id,
    ownerId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    manualReplay: {
      actorType: 'BUS_OWNER',
      actorId: String(ownerId),
      reason: 'Agent activation message resend',
      at: new Date(),
    },
  });

  return {
    statusCode: 200,
    responseBody: {
      success: true,
      message: replayMessage(delivery.status),
      data: {
        agentId: agent._id,
        smsStatus: delivery.status,
        messageId: delivery.jobId,
      },
    },
  };
};

const getAgentInvitationStatus = async (ownerId, agentId) => {
  if (!mongoose.isValidObjectId(agentId)) throw errors.agentNotFoundError();
  const agent = await repository.findOwnedAgent(ownerId, agentId);
  if (!agent) throw errors.agentNotFoundError();
  const job = await notificationOutbox.findLatestSms(`agent:${agent._id}`, { ownerId });
  return {
    statusCode: 200,
    responseBody: {
      success: true,
      data: job ? {
        messageId: job._id,
        status: job.status,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        nextAttemptAt: job.nextAttemptAt,
        lastError: job.lastError,
        createdAt: job.createdAt,
      } : null,
    },
  };
};

module.exports = { getAgentInvitationStatus, resendAgentInvitation };
