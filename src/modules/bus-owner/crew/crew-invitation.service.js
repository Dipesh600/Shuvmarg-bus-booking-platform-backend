'use strict';

const AppError = require('../../../shared/errors/app-error');
const notificationOutbox = require('../../notifications/outbox');

const invitationBody = ({ role, result }) => `Shuvmarg: You are assigned as ${role} for ${result.brand}. `
  + `Open the Partner app, choose ${role}, tap "Set up invited account", enter ${result.phone}, `
  + 'verify the SMS code, and create your password.';

const enqueueCrewInvitation = async ({ role, result, input, ownerId, brandId, session }) => {
  const shouldNotify = result.activationRequired
    && (!result.alreadyAssigned || input.resendInvite === true);
  if (!shouldNotify) return { jobId: null, jobStatus: null };

  const resendWindow = Math.floor(Date.now() / (5 * 60 * 1000));
  const version = input.resendInvite === true ? `resend:${resendWindow}` : 'initial';
  const idempotencyKey = `crew:${role}:${result.profileId}:activation:${version}`;
  const businessReference = `crew:${role}:${result.profileId}`;
  if (input.resendInvite === true) {
    await notificationOutbox.cancelPendingSms(businessReference, {
      session,
      excludeIdempotencyKey: idempotencyKey,
    });
  }
  const job = await notificationOutbox.enqueueSms({
    messageType: 'CREW_INVITATION',
    idempotencyKey,
    businessReference,
    recipientPhone: result.phone,
    body: invitationBody({ role, result }),
    userId: result.userId,
    ownerId,
    brandId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    manualReplay: input.resendInvite === true ? {
      actorType: 'BUS_OWNER',
      actorId: String(ownerId),
      reason: `${role} activation message resend`,
      at: new Date(),
    } : undefined,
  }, { session });
  return { jobId: job._id, jobStatus: job.status };
};

const deliverCrewInvitation = async ({ jobId, jobStatus, Profile, result, sendSMS, logger }) => {
  if (!jobId) return 'NOT_REQUESTED';
  let status = 'PENDING';
  try {
    if (['PROVIDER_ACCEPTED', 'DELIVERED'].includes(jobStatus)) status = 'QUEUED';
    else {
      const delivery = await notificationOutbox.deliverSmsNotification(jobId, { send: sendSMS });
      status = ['PROVIDER_ACCEPTED', 'DELIVERED'].includes(delivery?.status) ? 'QUEUED'
        : ['FAILED', 'EXPIRED', 'CANCELLED'].includes(delivery?.status) ? 'FAILED' : 'PENDING';
    }
  } catch (error) {
    status = 'FAILED';
    logger.warn('Crew invitation notification failed', { profileId: result.profileId, error: error.message });
  }

  try {
    await Profile.updateOne({ _id: result.profileId, accessStatus: 'INVITED' }, {
      $set: { invitationDeliveryStatus: status, invitationLastAttemptAt: new Date() },
    }, { runValidators: true });
    result.invitationDeliveryStatus = status;
  } catch (error) {
    logger.error('Crew invitation state persistence failed', {
      profileId: result.profileId,
      error: error.message,
    });
    throw new AppError('Crew was saved, but its invitation state could not be recorded. Retry safely.', 500);
  }
  return status;
};

module.exports = { deliverCrewInvitation, enqueueCrewInvitation };
