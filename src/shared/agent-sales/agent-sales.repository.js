'use strict';

const mongoose = require('mongoose');
const Agent = require('../../../models/agentModel');
const AgentAssignment = require('../../../models/agentAssignmentModel');
const AgentBooking = require('../../../models/agentBookingModel');

const MAX_CUSTOMER_SALES = 10000;

const id = (value) => new mongoose.Types.ObjectId(String(value));
const findAgentForUser = (userId) => Agent.findOne({ user: userId }).select('_id').lean();

const findOwnerBrandIds = (ownerId, agentId) => AgentAssignment.find({
  ownerId,
  agentId,
}).distinct('operatorId');

const bookingLookup = (brandIds) => ({
  $lookup: {
    from: 'bookings', localField: 'bookingId', foreignField: '_id', as: 'booking',
    pipeline: [
      { $match: {
        bookedVia: 'AGENT',
        ...(brandIds ? { brandId: { $in: brandIds.map(id) } } : {}),
      } },
      { $project: {
        _id: 0, tripId: 1, seats: 1, status: 1, bookedFrom: 1, bookedTo: 1,
        bookedDepartureTime: 1,
      } },
    ],
  },
});

const tripLookup = (brandIds) => ({
  $lookup: {
    from: 'trips', localField: 'booking.tripId', foreignField: '_id', as: 'trip',
    pipeline: [{ $match: brandIds ? { brandId: { $in: brandIds.map(id) } } : {} },
      { $project: {
        _id: 1, routeId: 1, tripDate: 1, departureTime: 1,
        directionLabel: 1, fromStopName: 1, toStopName: 1,
      } }],
  },
});

const salePipeline = ({ agentId, brandIds, page, limit }) => [
  { $match: { agentId: id(agentId) } },
  bookingLookup(brandIds),
  { $unwind: '$booking' },
  tripLookup(brandIds),
  { $unwind: '$trip' },
  { $lookup: {
    from: 'busroutes', localField: 'trip.routeId', foreignField: '_id', as: 'route',
    pipeline: [{ $project: { _id: 1, routeName: 1, from: 1, to: 1 } }],
  } },
  { $unwind: { path: '$route', preserveNullAndEmptyArrays: true } },
  { $project: {
    _id: 1, passengerName: 1, passengerPhone: 1, paymentMode: 1,
    ticketPrice: 1, boardingPoint: 1, droppingPoint: 1,
    conductorStatus: 1, createdAt: 1, booking: 1, trip: 1, route: 1,
  } },
  { $sort: { createdAt: -1, _id: -1 } },
  { $project: { _id: 0 } },
  { $facet: {
    rows: [{ $skip: (page - 1) * limit }, { $limit: limit }],
    count: [{ $count: 'value' }],
  } },
];

const listSales = async (scope) => {
  const [result = { rows: [], count: [] }] = await AgentBooking.aggregate(salePipeline(scope));
  return { rows: result.rows, total: result.count[0]?.value || 0 };
};

const customerPipeline = ({ agentId, page, limit }) => [
  { $match: { agentId: id(agentId) } },
  { $sort: { createdAt: -1, _id: -1 } },
  { $limit: MAX_CUSTOMER_SALES },
  { $group: {
    _id: { name: '$passengerName', phone: '$passengerPhone' },
    saleCount: { $sum: 1 },
    lastSoldAt: { $max: '$createdAt' },
  } },
  { $sort: { lastSoldAt: -1, '_id.phone': 1, '_id.name': 1 } },
  { $facet: {
    rows: [{ $skip: (page - 1) * limit }, { $limit: limit }],
    count: [{ $count: 'value' }],
  } },
];

const listCustomers = async (scope) => {
  const filter = { agentId: id(scope.agentId) };
  const [result = { rows: [], count: [] }, saleTotal] = await Promise.all([
    AgentBooking.aggregate(customerPipeline(scope)),
    AgentBooking.countDocuments(filter),
  ]);
  return {
    rows: result.rows,
    total: result.count[0]?.value || 0,
    truncatedSales: Math.max(0, saleTotal - MAX_CUSTOMER_SALES),
  };
};

module.exports = {
  findAgentForUser,
  findOwnerBrandIds,
  listCustomers,
  listSales,
  customerPipeline,
  MAX_CUSTOMER_SALES,
  salePipeline,
};
