'use strict';

const toAgentBooking = (input, ids) => ({
  _id: ids.agentBookingId,
  agentId: ids.agentId,
  bookingId: ids.bookingId,
  passengerName: input.passengerName,
  passengerPhone: input.passengerPhone,
  paymentMode: 'CASH',
  ticketPrice: input.ticketPrice,
  commissionRate: null,
  commissionAmount: null,
  commissionStatus: null,
  settlementId: null,
  boardingPoint: input.boardingPoint,
  droppingPoint: input.droppingPoint,
});

const toResponse = ({ booking, hold, trip, input }) => ({
  success: true,
  data: {
    bookingId: booking._id,
    seatNumbers: hold.seatNumbers,
    tripId: trip._id,
    tripDate: trip.tripDate,
    departureTime: trip.departureTime,
    arrivalTime: trip.arrivalTime,
    from: trip.fromStopName || null,
    to: trip.toStopName || null,
    passengerName: input.passengerName,
    passengerPhone: input.passengerPhone,
    status: booking.status || 'booked',
  },
});

module.exports = { toAgentBooking, toResponse };
