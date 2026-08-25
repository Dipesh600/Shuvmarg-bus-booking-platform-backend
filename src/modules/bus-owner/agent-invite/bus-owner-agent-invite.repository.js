'use strict';

const Agent = require('../../../../models/agentModel');
const OperatorBrand = require('../../../../models/operatorBrandModel');
const User = require('../../../../models/userModel');

/**
 * Ownership proof. Copied from staffAssignmentController's verifyBrandOwnership:
 * the brand must match BOTH the id supplied and the calling owner, in one query.
 * Two queries — fetch then compare — is how an ownership check ends up
 * accidentally optional.
 *
 * `brandId` is optional on this endpoint; when absent no brand is checked and
 * nothing brand-scoped is written.
 */
const findOwnedBrand = (ownerId, brandId) => OperatorBrand
  .findOne({ _id: brandId, ownerId })
  .select('name')
  .lean();

const createUser = (userData) => new User(userData).save();

const addAgentRole = (userId, activatedAt) => User.findByIdAndUpdate(
  userId,
  {
    $addToSet: { roles: 'agent' },
    $set: { 'roleActivatedAt.agent': activatedAt },
  },
  { new: true },
).lean();

const findAgentByUserId = (userId) => Agent.findOne({ user: userId });

/**
 * Created with `new` + save(), never findOneAndUpdate/upsert: the pre('save')
 * hook is what allocates the SM-AG code, and Mongoose does not run it for
 * upserts. An agent created by upsert would have no code to share.
 */
const createAgent = (agentData) => new Agent(agentData).save();

module.exports = {
  addAgentRole,
  createAgent,
  createUser,
  findAgentByUserId,
  findOwnedBrand,
};
