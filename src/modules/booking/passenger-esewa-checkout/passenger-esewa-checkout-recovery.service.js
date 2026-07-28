'use strict';

function createPassengerEsewaCheckoutRecoveryService(deps) {
  async function markDisputed(attempt, reason) {
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
    });
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
    const result = deps.mapper.response(
      410,
      'Your seat hold expired before payment could be confirmed.',
      'BOOKING_HOLD_EXPIRED'
    );
    await deps.repository.updateAttempt(attempt._id, {
      status: 'FAILED',
      failureReason: verification?.error || 'Seat hold expired.',
      processingExpiresAt: null,
      result,
    });
    return result;
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
      });
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
  };
}

module.exports = { createPassengerEsewaCheckoutRecoveryService };
