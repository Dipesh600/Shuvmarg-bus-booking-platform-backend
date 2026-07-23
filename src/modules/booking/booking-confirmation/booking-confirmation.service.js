'use strict';

function generateBookingTicketId({ now = new Date(), random = Math.random } = {}) {
  const dateStamp = now.toISOString().split('T')[0].replace(/-/g, '');
  return `TKT-${dateStamp}-${Math.floor(1000 + random() * 90000)}`;
}

function buildCommittedBookingResponse(booking, ticketId, fields) {
  return {
    success: true,
    message: 'Booking confirmed successfully!',
    data: {
      bookingId: booking._id,
      ticketId,
      originalAmount: fields.originalAmount,
      discountAmount: fields.discountAmount,
      smMoneyUsed: fields.smMoneyApplied,
      gatewayAmount: fields.gatewayAmount,
      totalAmount: fields.finalAmount,
      couponUsed: fields.appliedCouponCode || null,
      savings:
        fields.discountAmount > 0
          ? Math.round((fields.discountAmount / fields.originalAmount) * 10000) / 100
          : 0,
      paymentId: fields.paymentId || `sm_wallet_${Date.now()}`,
      gateway: fields.gateway,
      seats: fields.normalizedSeats,
      scratchCardId: fields.scratchCardId || null,
    },
  };
}

module.exports = {
  generateBookingTicketId,
  buildCommittedBookingResponse,
};
