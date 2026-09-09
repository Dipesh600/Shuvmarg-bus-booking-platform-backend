const { PassengerBookingCancellationValidationError } = require("./passenger-booking-cancellation-validation.error");

function fail(statusCode, message) {
  throw new PassengerBookingCancellationValidationError(statusCode, message);
}

function result(refund) {
  return {
    refundId: refund._id,
    destination: refund.destination,
    refundAmount: refund.refundAmount,
    status: refund.status,
  };
}

function createPassengerOperatorRefundDestinationService(repository, loadCreditWallet) {
  const selectOperatorRefundDestination = async (ticketId, userId, destination) => {
    if (typeof ticketId !== "string" || !ticketId.trim() || ticketId.length > 100) {
      fail(400, "A valid ticketId is required");
    }
    if (!["wallet", "original"].includes(destination)) fail(400, "Invalid refund destination");

    return repository.withTransaction(async (session) => {
      const booking = await repository.findBookingByTicketId(ticketId.trim(), session);
      if (!booking || String(booking.userId) !== String(userId)) fail(404, "Booking not found");
      if (booking.status !== "cancelled" || booking.cancelledBy !== "admin") {
        fail(409, "Refund destination is available only after an operator cancellation");
      }
      if (!booking.refundId) fail(409, "This refund requires reconciliation");

      let refund = await repository.findRefundForBooking(booking.refundId, booking._id, userId, session);
      if (!refund) fail(409, "This refund requires reconciliation");
      if (refund.destination) {
        if (refund.destination === destination) return result(refund);
        fail(409, "The refund destination is already locked");
      }
      if (refund.status !== "pending" || !(refund.refundAmount > 0)) {
        fail(409, "This refund can no longer be redirected");
      }

      refund = await repository.claimRefundDestination(refund._id, userId, destination, session);
      if (!refund) fail(409, "The refund destination was selected by another request");
      if (destination === "original") {
        refund.remarks = "Passenger selected the original payment source";
        await repository.saveRefund(refund, session);
        await recordRefundSms(repository, booking, refund, session);
        return result(refund);
      }

      const creditWallet = loadCreditWallet();
      const credited = await creditWallet({
        userId,
        amount: refund.refundAmount,
        purpose: "refund",
        referenceType: "refund",
        referenceId: booking._id,
        remarks: `Operator cancellation refund for ticket ${booking.ticketId}`,
        session,
      });
      const completedAt = new Date();
      refund.status = "completed";
      refund.refundGateway = "yatra_balance";
      refund.remarks = "Refunded instantly to Shuvmarg Money after operator cancellation";
      refund.processedAt = completedAt;
      refund.completedAt = completedAt;
      refund.settlementEvidence = { kind: "ledger", ledgerEntryId: credited?.ledgerEntry?._id || null };
      await repository.saveRefund(refund, session);
      await recordRefundSms(repository, booking, refund, session);
      return result(refund);
    });
  };

  return { selectOperatorRefundDestination };
}

async function recordRefundSms(repository, booking, refund, session) {
  if (!repository.findUserById) return;
  const user = await repository.findUserById(refund.userId, session);
  if (!user?.phone) return;
  await require("../../notifications/outbox/booking-sms.service")
    .enqueueRefundStatus({ booking, refund, phone: user.phone }, { session });
}

module.exports = { createPassengerOperatorRefundDestinationService };
