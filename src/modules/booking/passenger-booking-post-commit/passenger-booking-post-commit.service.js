'use strict';

/**
 * Isolates non-critical work that happens after booking persistence commits.
 */
function createPassengerBookingPostCommitService({
  passengerSeatHold,
  SMLedger,
  CouponHelper,
  smLedgerService,
  bookingConfirmation,
  logger,
  now = () => new Date(),
}) {
  const { buildCommittedBookingResponse, sendBookingConfirmedNotification } =
    bookingConfirmation;

  function buildPassengerCommittedBookingResponse(params) {
    return buildCommittedBookingResponse(params.booking, params.ticketId, {
      originalAmount: params.originalAmount,
      discountAmount: params.discountAmount,
      smMoneyApplied: params.smMoneyApplied,
      gatewayAmount: params.gatewayAmount,
      finalAmount: params.finalAmount,
      appliedCouponCode: params.appliedCouponCode,
      paymentId: params.paymentId,
      gateway: params.gateway,
      normalizedSeats: params.normalizedSeats,
      scratchCardId: null,
    });
  }

  async function completePassengerBookingPostCommit(params) {
    await completeHold(params);
    await linkInternalMoneyDebit(params);
    await recordCouponUsage(params);
    await generateCashback(params);
    await sendBookingNotification(params);
  }

  async function completeHold({ holdId, userId }) {
    try {
      await passengerSeatHold.completePassengerHold({ holdId, userId, now: now() });
    } catch (holdErr) {
      logger.warn('confirmBooking: Hold completion failed post-commit', {
        error: holdErr.message,
      });
    }
  }

  async function linkInternalMoneyDebit({ internalMoneyDebitEntryId, booking }) {
    if (!internalMoneyDebitEntryId) return;

    try {
      await SMLedger.updateOne(
        { _id: internalMoneyDebitEntryId },
        { $set: { bookingId: booking._id } }
      );
    } catch (linkErr) {
      logger.warn('confirmBooking: failed to link SM debit to booking', {
        error: linkErr.message,
      });
    }
  }

  async function recordCouponUsage(params) {
    if (!params.couponUsed) return;

    try {
      await CouponHelper.applyCoupon(
        params.appliedCouponCode,
        params.userId,
        params.booking._id,
        params.originalAmount,
        params.activeRole
      );
    } catch (couponError) {
      logger.error('Error recording coupon usage:', couponError);
    }
  }

  async function generateCashback(params) {
    try {
      const cashbackResult = await smLedgerService.generateCashback({
        userId: params.userId,
        bookingId: params.booking._id,
        baseTicketPrice: params.originalAmount,
      });

      if (cashbackResult && cashbackResult.scratchCard) {
        params.committedBookingResponse.data.scratchCardId =
          cashbackResult.scratchCard._id;
      }
    } catch (cashbackErr) {
      logger.error('confirmBooking: Failed to generate cashback', {
        error: cashbackErr.message,
      });
    }
  }

  async function sendBookingNotification(params) {
    try {
      await sendBookingConfirmedNotification({
        ...(params.booking.paymentOperationKey ? { durableBookingId: params.booking._id } : {}),
        userId: params.userId,
        ticketId: params.ticketId,
        metadata: {
          scheduleId: params.scheduleId,
          seats: params.normalizedSeats,
          originalAmount: params.originalAmount,
          discountAmount: params.discountAmount,
          finalAmount: params.finalAmount,
          smMoneyUsed: params.smMoneyApplied,
          gatewayAmount: params.gatewayAmount,
          couponCode: params.appliedCouponCode,
        },
      });
    } catch (notifErr) {
      logger.warn('confirmBooking: Notification failed post-commit', {
        error: notifErr.message,
      });
    }
  }

  return {
    buildPassengerCommittedBookingResponse,
    completePassengerBookingPostCommit,
  };
}

module.exports = {
  createPassengerBookingPostCommitService,
};
