'use strict';

const Agent = require('../../../../models/agentModel');

/**
 * The only fields this endpoint may load.
 *
 * A projection, not a full document, because the Agent schema also holds
 * citizenship and PAN numbers, bank details and admin notes. Selecting the whole
 * document and trimming it in the mapper would put all of that one careless
 * spread away from an operator's browser.
 *
 * `agentType` and `operationType` are here despite being deprecated: `scopeOf`
 * and `outletTypeOf` fall back to them for rows written before the new fields
 * existed. Omit `agentType` and every legacy OPERATOR_LINKED agent reads as
 * PLATFORM and gets refused as unassignable. `district` and `municipality` are
 * needed twice over — shown to the operator, and read by
 * `hasRequiredOutletDetails` when the status is derived.
 */
const PREVIEW_FIELDS = [
  'code',
  'agentId',
  'scope',
  'agentType',
  'applicationStatus',
  'outletType',
  'operationType',
  'businessName',
  'district',
  'municipality',
].join(' ');

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
  .select(PREVIEW_FIELDS)
  .populate({ path: 'user', select: 'name phoneVerified' })
  .lean();

module.exports = {
  PREVIEW_FIELDS,
  findAgentByCodeFilter,
};
