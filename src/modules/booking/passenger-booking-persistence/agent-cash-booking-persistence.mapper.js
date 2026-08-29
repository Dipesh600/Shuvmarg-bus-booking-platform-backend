'use strict';

const toSelection = (value) => value ? {
  sourceType: 'LEGACY',
  name: value,
  canonicalName: value,
} : {};

const toPassengers = (name, phone, seatNumbers) => seatNumbers.map((seatNo) => ({
  name,
  phone,
  age: 0,
  gender: 'other',
  seatNo,
}));

const mapAgentCashBookingPayload = (params) => ({
  _id: params.bookingId,
  userId: params.userId,
  tripId: params.trip._id,
  brandId: params.trip.brandId,
  busId: params.trip.busId || null,
  bookedFrom: params.trip.fromStopName || null,
  bookedTo: params.trip.toStopName || null,
  bookedDepartureTime: params.trip.departureTime || null,
  bookedArrivalTime: params.trip.arrivalTime || null,
  seats: params.seatNumbers,
  passengerDetails: toPassengers(params.passengerName, params.passengerPhone, params.seatNumbers),
  boardingPoint: toSelection(params.boardingPoint),
  droppingPoint: toSelection(params.droppingPoint),
  originalAmount: params.originalAmount,
  couponUsed: null,
  couponCode: null,
  discountAmount: 0,
  totalAmount: params.originalAmount,
  smMoneyUsed: 0,
  gatewayAmount: 0,
  gatewayFeeRate: 0,
  smDebitEntryId: null,
  paymentMethod: 'CASH',
  transactionId: null,
  bookedVia: 'AGENT',
  agentId: params.agentId,
  agentBookingId: params.agentBookingId,
  ticketId: params.ticketId,
});

module.exports = { mapAgentCashBookingPayload };
