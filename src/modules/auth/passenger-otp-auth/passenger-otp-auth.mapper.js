'use strict';

/**
 * src/modules/auth/passenger-otp-auth/passenger-otp-auth.mapper.js
 *
 * Maps the internal session-state object to the safe passenger response shape.
 *
 * Uses an explicit allow-list — no unknown fields can leak, including password,
 * tokenVersion, lockedUntil, deletedAt, forcePasswordChange, or OTP data.
 */

/**
 * Map session-state user data to a safe public User response object.
 *
 * @param {Object} userState - The `user` field from loadPassengerSessionState()
 * @returns {{
 *   id: string,
 *   name: string|null,
 *   email: string|null,
 *   phone: string,
 *   role: string,
 *   roles: string[],
 *   phoneVerified: boolean,
 *   profilePicture: string|null,
 * }}
 */
const toPassengerUserResponse = (userState) => ({
  id: String(userState._id),
  name: userState.name || null,
  email: userState.email || null,
  phone: userState.phone,
  role: userState.role,
  roles: Array.isArray(userState.roles) ? userState.roles : [],
  phoneVerified: Boolean(userState.phoneVerified),
  profilePicture: userState.profilePicture || null,
});

module.exports = { toPassengerUserResponse };
