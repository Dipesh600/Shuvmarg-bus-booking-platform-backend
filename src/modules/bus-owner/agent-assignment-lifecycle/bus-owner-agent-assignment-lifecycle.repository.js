'use strict';

const mongoose = require('mongoose');
const { AGENT_PREVIEW_FIELDS } = require('../../../shared/identity/agent-assignability');
const AgentAssignment = require('../../../../models/agentAssignmentModel');
const AgentBooking = require('../../../../models/agentBookingModel');

const idOf = (value) => String(value?._id || value || '');
const objectId = (value) => new mongoose.Types.ObjectId(idOf(value));
const salesKey = (agentId, brandId) => `${idOf(agentId)}:${idOf(brandId)}`;

const withPublicRelations = (query) => query
  .populate({ path: 'operatorId', select: 'brandName' })
  .populate({
    path: 'agentId',
    select: AGENT_PREVIEW_FIELDS,
    populate: { path: 'user', select: 'name phoneVerified' },
  })
  .lean();

const buildListRowsQuery = (filter, { page, limit }) => withPublicRelations(
  AgentAssignment.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((page - 1) * limit)
    .limit(limit),
);

const salesCountPipeline = (rows) => {
  const agentIds = [...new Set(rows.map((row) => idOf(row.agentId)).filter(Boolean))].map(objectId);
  const brandIds = [...new Set(rows.map((row) => idOf(row.operatorId)).filter(Boolean))].map(objectId);
  if (agentIds.length === 0 || brandIds.length === 0) return [];
  return [
    { $match: { agentId: { $in: agentIds } } },
    { $lookup: {
      from: 'bookings', localField: 'bookingId', foreignField: '_id', as: 'booking',
      pipeline: [
        { $match: { bookedVia: 'AGENT', brandId: { $in: brandIds } } },
        { $project: { _id: 0, brandId: 1 } },
      ],
    } },
    { $unwind: '$booking' },
    { $group: { _id: { agentId: '$agentId', brandId: '$booking.brandId' }, value: { $sum: 1 } } },
  ];
};

const countSalesForRows = async (rows) => {
  const pipeline = salesCountPipeline(rows);
  if (pipeline.length === 0) return new Map();
  const counts = await AgentBooking.aggregate(pipeline);
  return new Map(counts.map((row) => [salesKey(row._id.agentId, row._id.brandId), row.value]));
};

const listAssignments = async (filter, pagination) => {
  const rowsQuery = buildListRowsQuery(filter, pagination);
  const [rows, total] = await Promise.all([
    rowsQuery,
    AgentAssignment.countDocuments(filter),
  ]);
  return { rows, total, salesCounts: await countSalesForRows(rows) };
};

/** Ownership and the actor-specific starting state are in this atomic filter. */
const transitionAssignment = (filter, update) => withPublicRelations(
  AgentAssignment.findOneAndUpdate(filter, { $set: update }, {
    new: true,
    runValidators: true,
    context: 'query',
  }),
);

/** Diagnose only after an atomic miss, still scoped to the token owner. */
const findAssignmentState = (assignmentId, ownerId) => AgentAssignment
  .findOne({ _id: assignmentId, ownerId })
  .select('status')
  .lean();

module.exports = {
  buildListRowsQuery,
  salesCountPipeline,
  salesKey,
  findAssignmentState,
  listAssignments,
  transitionAssignment,
};
