'use strict';
const VERIFYING_LEASE_MS = 90 * 1000;
function createPassengerEsewaCheckoutFinalizationService(deps) {
  return async function finalizePassengerEsewaCheckout({
    userId,
    activeRole,
    transactionUuid,
    responseData,
  }) {
    if (!transactionUuid || typeof transactionUuid !== 'string') {
      return deps.mapper.response(
        400,
        'A valid payment reference is required.',
        'ESEWA_PAYMENT_REFERENCE_REQUIRED'
      );
    }
    const existing = await deps.repository.findOwnedAttempt(transactionUuid, userId);
    if (!existing) {
      return deps.mapper.response(
        404,
        'Payment attempt not found.',
        'ESEWA_PAYMENT_ATTEMPT_NOT_FOUND'
      );
    }
    if (['COMPLETED', 'FAILED', 'DISPUTED'].includes(existing.status)) {
      if (existing.status === 'COMPLETED' && !existing.result) return deps.recovery.recoverCommittedBooking(existing);
      return existing.result || deps.mapper.response(
        409,
        'This payment attempt is already closed.',
        'ESEWA_PAYMENT_ATTEMPT_CLOSED'
      );
    }
    if (existing.fulfillmentRetryAt && new Date(existing.fulfillmentRetryAt).getTime() > Date.now()) {
      return deps.mapper.response(202, 'Payment received. Booking recovery is pending; please do not pay again.', 'PAYMENT_VERIFICATION_PENDING');
    }
    const config = deps.readConfig();
    require('../../../shared/esewa-environment').assertEsewaAttemptEnvironment(existing, config);
    const attempt = await deps.repository.claimOwnedAttempt(transactionUuid, userId, VERIFYING_LEASE_MS);
    if (!attempt) {
      return deps.mapper.response(
        409,
        'Payment confirmation is already in progress.',
        'ESEWA_PAYMENT_CONFIRMATION_IN_PROGRESS'
      );
    }
    const recovered = await deps.recovery.recoverRecordedTransaction(attempt);
    if (recovered) return recovered;
    let response;
    try {
      response = deps.validateResponse({
        responseData,
        attempt,
        secretKey: config.secretKey,
        signature: deps.signature,
      });
    } catch (error) {
      await deps.repository.updateAttempt(attempt._id, {
        status: 'INITIATED',
        processingExpiresAt: null,
      }, attempt.processingToken);
      throw error;
    }
    if (response?.status && response.status !== 'COMPLETE') {
      await deps.repository.updateAttempt(attempt._id, {
        status: 'INITIATED',
        processingExpiresAt: null,
      }, attempt.processingToken);
      return deps.mapper.response(
        402,
        'eSewa has not completed this payment.',
        'ESEWA_PAYMENT_NOT_COMPLETE'
      );
    }
    const verified = await deps.verifyPayment(attempt.transactionUuid, attempt.gatewayAmount);
    if (!verified?.verified) return deps.recovery.handleUnverified(attempt, verified);
    await deps.repository.updateAttempt(attempt._id, {
      providerVerifiedAt: attempt.providerVerifiedAt || new Date(), verificationStatus: 'COMPLETE',
    }, attempt.processingToken);
    if (deps.preparePaymentRetry) await deps.preparePaymentRetry(attempt);
    const hold = await deps.repository.findHoldByAttempt(attempt);
    if (
      !hold ||
      hold.status !== 'held' ||
      new Date(hold.expiresAt).getTime() <= Date.now()
    ) {
      return deps.recovery.markDisputed(attempt, 'Payment completed after the seat hold became unavailable.', { refundRequired: true });
    }
    const request = {
      body: {
        ...attempt.checkoutPayload,
        gateway: 'esewa',
        paymentId: attempt.transactionUuid,
        paymentAmount: attempt.gatewayAmount,
      },
      dbUser: { _id: attempt.userId },
      userInfo: { activeRole },
      bookingHold: hold,
      paymentAttemptQuote: attempt.confirmationQuote,
      paymentAttemptId: attempt._id,
      paymentProcessingToken: attempt.processingToken,
      providerPaymentVerified: true,
      refundPolicySnapshot: attempt.refundPolicySnapshot,
    };
    let result;
    try {
      result = await deps.orchestrate({ req: request, res: { headersSent: false } });
    } catch (error) {
      if (error.code === 'PAYMENT_LEASE_LOST') throw error;
      result = { body: { errorCode: 'PAYMENT_RECOVERY_REQUIRED' } };
    }
    if (result?.statusCode === 201 && result.body?.success) {
      await deps.repository.updateAttempt(attempt._id, {
        status: 'COMPLETED',
        bookingId: result.body.data?.bookingId || null,
        providerReference: response?.transaction_code || verified.esewaData?.ref_id || verified.esewaData?.refId || null,
        processingExpiresAt: null,
        result,
      }, attempt.processingToken);
      return result;
    }
    if (result?.body?.errorCode === 'ESEWA_VERIFICATION_FAILED') {
      await deps.repository.updateAttempt(attempt._id, {
        status: 'INITIATED',
        processingExpiresAt: null,
      }, attempt.processingToken);
      return result;
    }
    // The commit may have succeeded even if returning its response failed.
    const current = await deps.repository.findOwnedAttempt(attempt.transactionUuid, attempt.userId);
    if (current?.status === 'COMPLETED') return deps.recovery.recoverCommittedBooking(current);
    if (['PAYMENT_RECOVERY_REQUIRED', 'BOOKING_RECONCILIATION_REQUIRED'].includes(result?.body?.errorCode)
      && (attempt.fulfillmentRetries || 0) < 3) {
      await deps.repository.updateAttempt(attempt._id, { status: 'INITIATED', processingExpiresAt: null,
        fulfillmentRetryAt: new Date(Date.now() + 30000),
        fulfillmentRetries: (attempt.fulfillmentRetries || 0) + 1 }, attempt.processingToken);
      return deps.mapper.response(202, 'Payment received. We are recovering your booking; please do not pay again.', 'PAYMENT_VERIFICATION_PENDING');
    }
    return deps.recovery.markDisputed(
      attempt,
      result?.body?.message || 'Booking confirmation failed after payment.',
      { refundRequired: true }
    );
  };
}
module.exports = {
  createPassengerEsewaCheckoutFinalizationService,
  VERIFYING_LEASE_MS,
};
