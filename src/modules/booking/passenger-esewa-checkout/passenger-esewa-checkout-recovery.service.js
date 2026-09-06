'use strict';

function createPassengerEsewaCheckoutRecoveryService(deps) {
  async function markDisputed(attempt, reason) {
    if (deps.closeUnfulfilledAttempt) {
      const current = await deps.repository.findOwnedAttempt(attempt.transactionUuid, attempt.userId);
      if (current?.status === 'COMPLETED') return deps.recoverCommittedBooking(current);
      return deps.closeUnfulfilledAttempt(attempt, { status: 'DISPUTED', reason, createDispute: true,
        result: deps.mapper.response(409, 'Your payment was received but the ticket could not be issued. Your case is recorded for resolution.', 'PAYMENT_RECEIVED_BOOKING_DISPUTED') });
    }
    let transaction = await deps.repository.findTransactionByPaymentId(
      attempt.transactionUuid,
      attempt.userId
    );
    if (!transaction) {
      transaction = await deps.repository.createDisputedTransaction(
        attempt,
        reason
      );
    }
    await deps.sendDisputeAlert({ transaction, reason });
    const result = deps.mapper.response(
      409,
      'Your payment was received, but the ticket could not be issued. Our team will resolve it.',
      'PAYMENT_RECEIVED_BOOKING_DISPUTED',
      { caseId: transaction._id }
    );
    await deps.repository.updateAttempt(attempt._id, {
      status: 'DISPUTED',
      transactionRecordId: transaction._id,
      failureReason: reason,
      processingExpiresAt: null,
      result,
    }, attempt.processingToken);
    return result;
  }

  async function resolveUnavailableHold(attempt) {
    const verification = await deps.verifyPayment(
      attempt.transactionUuid,
      attempt.gatewayAmount
    );
    if (verification?.verified) {
      return markDisputed(
        attempt,
        'Payment completed after the seat hold became unavailable.'
      );
    }
    return handleUnverified(attempt, verification);
  }

  async function handleUnverified(attempt, verification) {
    const terminal = verification?.identityVerified && ['CANCELED', 'FULL_REFUND'].includes(verification.status);
    if (terminal && deps.closeUnfulfilledAttempt) return deps.closeUnfulfilledAttempt(attempt, {
      status: 'FAILED', reason: `Provider reports ${verification.status}`, createDispute: false,
      result: deps.mapper.response(410, 'The payment was cancelled or refunded. Reserved SM Money has been restored.', 'PAYMENT_CLOSED'),
    });
    await deps.repository.updateAttempt(attempt._id, { status: 'INITIATED', processingExpiresAt: null }, attempt.processingToken);
    return deps.mapper.response(202, 'Payment status is not confirmed yet. We will keep checking this payment.', 'PAYMENT_VERIFICATION_PENDING');
  }

  async function recoverRecordedTransaction(attempt) {
    const transaction = await deps.repository.findTransactionByPaymentId(
      attempt.transactionUuid,
      attempt.userId
    );
    if (!transaction) return null;
    if (transaction.status === 'SUCCESS' && transaction.bookingId) {
      const result = {
        statusCode: 201,
        body: {
          success: true,
          message: 'Booking confirmed successfully!',
          data: {
            bookingId: transaction.bookingId,
            ticketId: transaction.ticketId,
            originalAmount: attempt.originalAmount,
            discountAmount: attempt.discountAmount,
            smMoneyUsed: attempt.smMoneyApplied,
            gatewayAmount: attempt.gatewayAmount,
            totalAmount: attempt.finalAmount,
            paymentId: attempt.transactionUuid,
            gateway: 'esewa',
            seats: attempt.checkoutPayload.seatNumbers,
          },
        },
      };
      await deps.repository.updateAttempt(attempt._id, {
        status: 'COMPLETED',
        bookingId: transaction.bookingId,
        transactionRecordId: transaction._id,
        processingExpiresAt: null,
        result,
      }, attempt.processingToken);
      return result;
    }
    return markDisputed(
      attempt,
      'A prior confirmation requires payment reconciliation.'
    );
  }

  return {
    markDisputed,
    resolveUnavailableHold,
    recoverRecordedTransaction,
    handleUnverified,
    recoverCommittedBooking: deps.recoverCommittedBooking,
  };
}

module.exports = { createPassengerEsewaCheckoutRecoveryService };
