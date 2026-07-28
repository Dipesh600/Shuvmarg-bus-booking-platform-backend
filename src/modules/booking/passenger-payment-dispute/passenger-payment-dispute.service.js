'use strict';

/**
 * Service boundary for passenger payment dispute handling.
 */
function createPassengerPaymentDisputeService({
  repository,
  createLocalNotification,
  logger,
}) {
  if (!repository || typeof repository.markDisputed !== 'function') {
    throw new Error('createPassengerPaymentDisputeService requires repository');
  }

  function markPassengerPaymentDisputed(params) {
    return repository.markDisputed(params);
  }

  async function sendPassengerPaymentDisputeAdminAlert({ transaction, reason }) {
    try {
      logger.error('🚨 DISPUTED PAYMENT — Manual refund required', {
        transactionId: transaction._id,
        esewaPaymentId: transaction.transactionId,
        userId: transaction.userId,
        amount: transaction.totalAmount,
        tripId: transaction.tripId,
        seats: transaction.seats,
        reason,
      });

      const adminUserId = process.env.ADMIN_ALERT_USER_ID;
      if (adminUserId) {
        await createLocalNotification(
          adminUserId,
          'DISPUTED_PAYMENT',
          '⚠️ Disputed Payment — Action Required',
          `Payment of Rs.${transaction.totalAmount} received (eSewa: ${transaction.transactionId}) but booking creation failed. Case ID: ${transaction._id}. Reason: ${reason}`,
          {
            transactionId: transaction._id,
            esewaPaymentId: transaction.transactionId,
            userId: transaction.userId,
            amount: transaction.totalAmount,
            tripId: transaction.tripId,
            seats: transaction.seats,
          }
        );
      }
    } catch (alertErr) {
      logger.error('confirmBooking: failed to send admin dispute alert', {
        error: alertErr.message,
      });
    }
  }

  async function notifyPassengerPaymentDispute({ userId, transaction, paymentId, amount }) {
    try {
      await createLocalNotification(
        userId,
        'PAYMENT_DISPUTE',
        'Payment Received — Ticket Issue',
        `Your payment of Rs.${amount} was received but ticket creation encountered an issue. Case ID: ${transaction._id}. Our team will resolve this within 2 hours.`,
        {
          transactionId: transaction._id,
          esewaPaymentId: paymentId,
          amount,
        }
      );
    } catch (notifErr) {
      logger.error('confirmBooking: failed to notify user about dispute', {
        error: notifErr.message,
      });
    }
  }

  return {
    markPassengerPaymentDisputed,
    sendPassengerPaymentDisputeAdminAlert,
    notifyPassengerPaymentDispute,
  };
}

module.exports = {
  createPassengerPaymentDisputeService,
};
