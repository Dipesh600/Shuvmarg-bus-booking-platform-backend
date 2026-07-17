'use strict';

/**
 * otp-resend.repository.js
 *
 * Only this file may import the User model among all otp-resend production files.
 */
const User = require('../../../../models/userModel');

/**
 * Find a user for PASSWORD_RESET resend by their normalized phone.
 * Preserves the exact legacy query — no filters added.
 *
 * @param {string} normalizedPhone
 * @returns {Promise<object|null>}
 */
const findPasswordResetUser = (normalizedPhone) =>
  User.findOne({ phone: normalizedPhone });

module.exports = { findPasswordResetUser };
