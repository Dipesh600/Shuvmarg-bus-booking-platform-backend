'use strict';

const User = require('../../../../../models/userModel');
const BusOwner = require('../../../../../models/busOwnerModel');
const OTP = require('../../../../../models/otpModel');

const findConsumedOtp = (phone) => OTP.findOne({
  phone,
  purpose: 'BUSOWNER_REGISTRATION',
  isUsed: true,
});

const findUserByEmail = (email) => User.findOne({ email });

const upgradeUserToBusOwner = (userId, activatedAt) => User.findByIdAndUpdate(
  userId,
  {
    $addToSet: { roles: 'busOwner' },
    $set: { 'roleActivatedAt.busOwner': activatedAt },
  },
  { new: true },
);

/**
 * Check whether a User already has a usable password without returning the hash.
 * Used by the upgrade path to decide whether the submitted password is required.
 *
 * `User.password` has `select:false` — the normal checkPhoneForRole() result
 * does NOT include the password field, so direct inspection on that object
 * always produces the wrong answer.
 *
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
const hasUsablePassword = (userId) =>
  User.exists({
    _id: userId,
    password: { $exists: true, $type: 'string', $ne: '' },
  }).then(Boolean);

/**
 * Atomically save a hashed password AND add the busOwner role in one update.
 * Used ONLY when the existing User currently has no password (passwordless passenger).
 *
 * The filter `$or: [ password $exists:false | null | '' ]` ensures:
 *   - An existing password is never overwritten.
 *   - If a concurrent request established a password between our hasUsablePassword
 *     check and this update, the update returns null and the service can re-read.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.hashedPassword
 * @param {Date}   params.activatedAt
 * @returns {Promise<import('mongoose').Document|null>}
 *   Updated document with new:true, or null if the account was no longer passwordless.
 */
const upgradePasswordlessUserToBusOwner = ({ userId, hashedPassword, activatedAt }) =>
  User.findOneAndUpdate(
    {
      _id: userId,
      $or: [
        { password: { $exists: false } },
        { password: null },
        { password: '' },
      ],
    },
    {
      $addToSet: { roles: 'busOwner' },
      $set: {
        password: hashedPassword,
        'roleActivatedAt.busOwner': activatedAt,
      },
    },
    { new: true },
  );

const createUser = async (userData) => {
  const user = new User(userData);
  return user.save();
};

const findBusOwnerByUser = (userId) => BusOwner.findOne({ user: userId });

const createBusOwnerProfile = async ({ userId, companyName }) => {
  const busOwner = new BusOwner({
    user: userId,
    companyName: companyName.trim(),
    verificationStatus: 'pending',
  });
  return busOwner.save();
};

module.exports = {
  findConsumedOtp,
  findUserByEmail,
  upgradeUserToBusOwner,
  hasUsablePassword,
  upgradePasswordlessUserToBusOwner,
  createUser,
  findBusOwnerByUser,
  createBusOwnerProfile,
};
