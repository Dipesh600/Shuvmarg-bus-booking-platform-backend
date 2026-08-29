'use strict';

const tripContext = (trip = {}, booking = {}, route = {}) => ({
  routeName: route.routeName || trip.directionLabel || null,
  from: booking.bookedFrom || trip.fromStopName || route.from || null,
  to: booking.bookedTo || trip.toStopName || route.to || null,
  tripDate: trip.tripDate || null,
  departureTime: booking.bookedDepartureTime || trip.departureTime || null,
});

const toSale = (row) => ({
  passengerName: row.passengerName,
  passengerPhone: row.passengerPhone,
  seats: row.booking?.seats || [],
  ticketPrice: row.ticketPrice,
  paymentMode: row.paymentMode,
  status: row.booking?.status || null,
  conductorStatus: row.conductorStatus,
  boardingPoint: row.boardingPoint || null,
  droppingPoint: row.droppingPoint || null,
  soldAt: row.createdAt,
  trip: tripContext(row.trip, row.booking, row.route),
});

const pagination = ({ page, limit, total }) => ({
  page, limit, total, totalPages: Math.ceil(total / limit),
});

const toSalesResponse = ({ rows, page, limit, total }) => ({
  success: true,
  data: rows.map(toSale),
  pagination: pagination({ page, limit, total }),
});

const toCustomersResponse = ({ rows, page, limit, total }) => ({
  success: true,
  data: rows.map((row) => ({
    passengerName: row._id.name,
    passengerPhone: row._id.phone,
    saleCount: row.saleCount,
    lastSoldAt: row.lastSoldAt,
  })),
  pagination: pagination({ page, limit, total }),
});

module.exports = { toCustomersResponse, toSale, toSalesResponse };
