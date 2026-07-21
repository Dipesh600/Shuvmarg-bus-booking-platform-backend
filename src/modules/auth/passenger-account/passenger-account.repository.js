'use strict';

/**
 * src/modules/auth/passenger-account/passenger-account.repository.js
 *
 * All direct User model access for the passenger-account module.
 *
 * RESPONSIBILITIES
 * ----------------
 * - Find a User identity by phone, including soft-deleted and restricted records
 *   (so the service never accidentally creates a duplicate for a known phone).
 * - Create a minimal new passenger User.
 * - Atomically add the passenger role to an existing User.
 * - Re-read a User after a concurrent creation or role-grant race.
 *
 * CONTRACT
 * --------
 * - Service files must not call User.findOne / findByIdAndUpdate directly.
 * - Function names describe exact behaviour.
 * - Duplicate-key errors (code 11000) are NOT swallowed — the service needs them.
 * - Lean results are used only when document methods (e.g. .save()) are not needed.
 * - No business messages are embedded here.
 */

const User = require('../../../../models/userModel');
const { buildPhoneQuery, normalizePhone } = require('../../../../utils/phoneGuard');

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Find a User by phone including soft-deleted and restricted records.
 *
 * Uses buildPhoneQuery with includeDeleted:true so that a soft-deleted identity
 * is found and reported to the service instead of being missed, which would
 * otherwise cause a duplicate-User creation attempt to fail with a confusing
 * duplicate-key error.
 *
 * Returns a lean object (document methods not needed — all writes go through
 * separate repository functions).
 *
 * @param {string} rawPhone - The raw phone string as supplied by the caller.
 * @returns {Promise<Object|null>}
 */
const findIdentityByPhone = (rawPhone) => {
  const query = buildPhoneQuery(rawPhone, { includeDeleted: true });
  return User.findOne(query)
    .select('role roles roleActivatedAt status deletedAt phoneVerified isVerified tokenVersion')
    .lean();
};

/**
 * Create a minimal passenger User document and persist it.
 *
 * The caller must supply only the minimal required fields.
 * The pre-save hook will normalize the phone and backfill roleActivatedAt.
 * Duplicate-key errors (code 11000) bubble up to the service for race recovery.
 *
 * @param {Object} data - Minimal user data (phone, role, roles, status, etc.)
 * @returns {Promise<import('mongoose').Document>} Saved User document.
 */
const createMinimalPassenger = async (data) => {
  const user = new User(data);
  return user.save();
};

/**
 * Atomically add the passenger role to an existing User.
 *
 * The filter `{ _id: userId, roles: { $ne: 'passenger' } }` ensures:
 *   - The update only runs when passenger is not already present.
 *   - The activation timestamp is set only on the first successful grant.
 *   - A concurrent grant returns null from the second call (role already added).
 *
 * On null return the service must re-read the User and return the existing record.
 * $setOnInsert is NOT used — this is not an upsert.
 *
 * @param {string} userId
 * @param {Date} now
 * @returns {Promise<import('mongoose').Document|null>}
 *   Updated document with new:true, or null if passenger role was already present.
 */
const addPassengerRoleIfMissing = (userId, now) =>
  User.findOneAndUpdate(
    {
      _id: userId,
      roles: { $ne: 'passenger' },
    },
    {
      $addToSet: { roles: 'passenger' },
      $set: {
        'roleActivatedAt.passenger': now,
        phoneVerified: true,
      },
    },
    { new: true },
  );

/**
 * Re-read a User by ID after a concurrent creation or role-grant race.
 *
 * Returns a lean object — used only for eligibility checks and service returns.
 *
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
const findByIdForPassengerResolution = (userId) =>
  User.findById(userId)
    .select('role roles roleActivatedAt status deletedAt phoneVerified isVerified tokenVersion')
    .lean();

/**
 * Re-read a User by raw phone after a duplicate-key creation race.
 *
 * Uses the same includeDeleted:true query as findIdentityByPhone so that
 * a race involving a soft-deleted account is handled consistently.
 *
 * @param {string} rawPhone
 * @returns {Promise<Object|null>}
 */
const findIdentityByPhoneAfterRace = (rawPhone) => {
  const normalized = normalizePhone(rawPhone);
  // After a race the winning document was stored with the normalized phone
  // (pre-save hook ran). Search by normalized form for reliability.
  return User.findOne({ phone: normalized })
    .select('_id role roles roleActivatedAt status deletedAt phoneVerified isVerified tokenVersion')
    .lean();
};

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  findIdentityByPhone,
  createMinimalPassenger,
  addPassengerRoleIfMissing,
  findByIdForPassengerResolution,
  findIdentityByPhoneAfterRace,
};
