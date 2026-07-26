'use strict';

/**
 * Passenger booking persistence mappers.
 */
function formatPassengerBookingPassengers({ passengerDetails, seatNumbers = [] }) {
  const seats = Array.isArray(seatNumbers) ? seatNumbers : [];
  const defaultSeat = seats[0] || 'N/A';

  return (passengerDetails || []).map((p) => {
    const rawSeat = Array.isArray(p.seatNo) ? p.seatNo[0] : p.seatNo;
    const seatNo = rawSeat || defaultSeat;

    return {
      name: p.name || 'Passenger',
      age: p.age || 0,
      gender: p.gender || 'other',
      seatNo,
    };
  });
}

function mapPassengerBookingPaymentMethod({ gateway, smMoneyApplied }) {
  if (gateway === 'wallet') {
    return 'SM_WALLET';
  }
  if (smMoneyApplied > 0) {
    return 'SM_WALLET_SPLIT';
  }
  return gateway.toUpperCase();
}

function mapPassengerBookingPersistencePayload({
  userId,
  scheduleId,
  trip,
  bookedFrom,
  bookedTo,
  bookedDepartureTime,
  bookedArrivalTime,
  seatNumbers,
  formattedPassengers,
  boardingPoint,
  droppingPoint,
  originalAmount,
  couponUsed,
  appliedCouponCode,
  discountAmount,
  finalAmount,
  smMoneyApplied,
  gatewayAmount,
  gatewayFeeRate,
  internalMoneyDebitEntryId,
  paymentMethod,
  transactionId,
  ticketId,
}) {
  return {
    userId,
    tripId: scheduleId,
    brandId: trip.brandId || null,
    busId: trip.busId || null,
    bookedFrom: bookedFrom || null,
    bookedTo: bookedTo || null,
    bookedDepartureTime: bookedDepartureTime || null,
    bookedArrivalTime: bookedArrivalTime || null,
    seats: seatNumbers,
    passengerDetails: formattedPassengers,
    boardingPoint: boardingPoint || {},
    droppingPoint: droppingPoint || {},
    originalAmount,
    couponUsed,
    couponCode: appliedCouponCode,
    discountAmount,
    totalAmount: finalAmount,
    smMoneyUsed: smMoneyApplied,
    gatewayAmount,
    gatewayFeeRate,
    smDebitEntryId: internalMoneyDebitEntryId,
    paymentMethod,
    transactionId,
    bookedVia: 'APP',
    ticketId,
  };
}

module.exports = {
  formatPassengerBookingPassengers,
  mapPassengerBookingPaymentMethod,
  mapPassengerBookingPersistencePayload,
};
