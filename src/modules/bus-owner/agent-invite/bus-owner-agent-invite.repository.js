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
 *
 * `brandName` is the schema's field. There is no `name` on OperatorBrand — every
 * other module reads `brandName`, and selecting `name` here silently produced an
 * undefined brand name in both the invite SMS and the response body.
 */
const findOwnedBrand = (ownerId, brandId) => OperatorBrand
  .findOne({ _id: brandId, ownerId })
  .select('brandName')
  .lean();

const { withTransaction } = require('../../../shared/auth/identity-transaction');
const { availableAccountFilter } = require('../../../shared/auth/role-grant-state');
const createUser = (userData, session) => new User(userData).save({ session });

const addAgentRole = (userId, activatedAt, session) => User.findOneAndUpdate(
  availableAccountFilter(userId),
  {
    $addToSet: { roles: 'agent' },
    $set: { 'roleActivatedAt.agent': activatedAt },
  },
  { new: true, session },
).lean();

const findAgentByUserId = (userId, session) => Agent.findOne({ user: userId }).session(session || null);
const findOwnedAgent = (ownerId, agentId) => Agent.findOne({ _id: agentId, createdByOwnerId: ownerId }).lean();
const findUserForActivation = (userId) => User.findById(userId).select('name phone status roles role deletedAt').lean();

/**
 * Created with `new` + save(), never findOneAndUpdate/upsert: the pre('save')
 * hook is what allocates the SM-AG code, and Mongoose does not run it for
 * upserts. An agent created by upsert would have no code to share.
 */
const createAgent = (agentData, session) => new Agent(agentData).save({ session });

module.exports = {
  withTransaction,
  addAgentRole,
  createAgent,
  createUser,
  findAgentByUserId,
  findOwnedAgent,
  findUserForActivation,
  findOwnedBrand,
};
