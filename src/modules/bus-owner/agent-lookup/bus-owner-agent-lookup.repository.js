'use strict';

const { AGENT_PREVIEW_FIELDS } = require('../../../shared/identity/agent-assignability');
const Agent = require('../../../../models/agentModel');

/**
 * `phoneVerified` is loaded and never returned. It is the input
 * `deriveOperatorKycStatus` refuses to work without — pass it undefined and the
 * derive bails to null, quietly leaving the stale stored status in its place.
 *
 * `name` is the only other user field taken. Not phone, not email: the master
 * plan's preview is a "is this the right person?" check, and a lookup that
 * returned contact details would be a PII scraper with a code for a password.
 */
const findAgentByCodeFilter = (filter) => Agent
  .findOne(filter)
  .select(AGENT_PREVIEW_FIELDS)
  .populate({ path: 'user', select: 'name phoneVerified' })
  .lean();

module.exports = {
  findAgentByCodeFilter,
};
