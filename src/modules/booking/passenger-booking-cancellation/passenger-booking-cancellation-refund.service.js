const createPassengerBookingCancellationRefundService = (
  repository,
  loadClawbackCashback,
  loadCreditWallet
) => {
  const processRefundAndClawback = async (booking, userId, estimate, cancelReason, requestBody) => {
    // Invoke loader outside try/catch, failure propagates
    const clawbackCashback = loadClawbackCashback();

    try {
      const clawbackResult = await clawbackCashback(booking._id);
      if (clawbackResult.clawedBack > 0) {
        console.log(`Clawed back Rs. ${clawbackResult.clawedBack} cashback for cancelled booking ${booking._id}`);
      }
    } catch (cbErr) {
      console.error("Cashback clawback failed during cancellation:", cbErr);
    }

    const refundMethodInput = requestBody.refundMethod || "original";
    const isWalletRefund = refundMethodInput === "wallet";

    let refundStatus = "pending";
    let refundGateway = null;
    let remarks = null;
    let processedAt = null;
    let completedAt = null;

    if (isWalletRefund) {
      refundStatus = "completed";
      refundGateway = "yatra_balance";
      remarks = "Refunded instantly to Shuvmarg Money";
      processedAt = new Date();
      completedAt = new Date();

      // Invoke loader outside try/catch, failure propagates
      const creditWallet = loadCreditWallet();

      try {
        await creditWallet({
          userId: userId,
          amount: estimate.refundAmount,
          purpose: "refund",
          referenceType: "refund",
          referenceId: booking._id,
          remarks: `Instant refund for cancelled ticket ${booking.ticketId}`,
        });
      } catch (walletErr) {
        console.error("Instant Yatra Balance credit failed:", walletErr);
        refundStatus = "pending";
        refundGateway = null;
        remarks = `Failed instant Yatra Balance refund: ${walletErr.message}. Queued for manual check.`;
        processedAt = null;
        completedAt = null;
      }
    }

    const refund = await repository.createRefund({
      userId: userId,
      bookingId: booking._id,
      originalAmount: estimate.refundAmount + estimate.cancellationCharge,
      cancellationCharge: estimate.cancellationCharge,
      refundAmount: estimate.refundAmount,
      status: refundStatus,
      requestedAt: new Date(),
      processedAt,
      completedAt,
      remarks,
      refundGateway,
      reason: cancelReason || "User cancelled",
    });

    return refund;
  };

  return { processRefundAndClawback };
};

module.exports = {
  createPassengerBookingCancellationRefundService,
};
