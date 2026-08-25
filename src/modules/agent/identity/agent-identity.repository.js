'use strict';

const Agent = require('../../../../models/agentModel');
const User = require('../../../../models/userModel');

const AGENT_IDENTITY_FIELDS = [
  'code agentId scope outletType applicationStatus agentType operationType',
  'district municipality placeName businessName shopAddress createdByOwnerId createdAt',
].join(' ');

const USER_IDENTITY_FIELDS = 'name phone profilePicture';

/**
 * Loaded as a document, not lean: an agent created before the SM-AG scheme has no
 * `code`, and only a real document can run the pre('save') hook that allocates
 * one. See backfillIdentifiers in the service.
 */
const findAgentByUserId = (userId) => Agent.findOne({ user: userId }).select(AGENT_IDENTITY_FIELDS);

const findUserById = (userId) => User.findById(userId).select(USER_IDENTITY_FIELDS).lean();

const saveAgent = (agent) => agent.save();

const updateUserName = (userId, name) => User.findByIdAndUpdate(
  userId,
  { $set: { name } },
  { new: true },
).select(USER_IDENTITY_FIELDS).lean();

module.exports = {
  AGENT_IDENTITY_FIELDS,
  USER_IDENTITY_FIELDS,
  findAgentByUserId,
  findUserById,
  saveAgent,
  updateUserName,
};
