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
    const existing = await deps.repository.findOwnedAttempt(
      transactionUuid,
      userId
    );
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
    const config = deps.readConfig();
    const attempt = await deps.repository.claimOwnedAttempt(
      transactionUuid,
      userId,
      VERIFYING_LEASE_MS
    );
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
    const hold = await deps.repository.findHoldByAttempt(attempt);
    const verified = await deps.verifyPayment(attempt.transactionUuid, attempt.gatewayAmount);
    if (!verified?.verified) return deps.recovery.handleUnverified(attempt, verified);
    if (
      !hold ||
      hold.status !== 'held' ||
      new Date(hold.expiresAt).getTime() <= Date.now()
    ) {
      return deps.recovery.markDisputed(attempt, 'Payment completed after the seat hold became unavailable.');
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
    const result = await deps.orchestrate({
      req: request,
      res: { headersSent: false },
    });
    if (result?.statusCode === 201 && result.body?.success) {
      await deps.repository.updateAttempt(attempt._id, {
        status: 'COMPLETED',
        bookingId: result.body.data?.bookingId || null,
        providerReference: response?.transaction_code || null,
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
    return deps.recovery.markDisputed(
      attempt,
      result?.body?.message || 'Booking confirmation failed after payment.'
    );
  };
}

module.exports = {
  createPassengerEsewaCheckoutFinalizationService,
  VERIFYING_LEASE_MS,
};
