'use strict';

/**
 * src/modules/auth/passenger-account/index.js
 *
 * Public API for the passenger-account module.
 *
 * Only the intended internal contract is exported.
 * Repository functions, policy helpers, error factories and raw model
 * access are NOT exported from this entry point.
 *
 * Usage
 * -----
 *   const { resolvePassengerAccountAfterPhoneVerification } =
 *     require('src/modules/auth/passenger-account');
 *
 * This module has no HTTP route. It is called by the upcoming passenger
 * OTP authentication module after phone ownership is verified.
 */

const { resolvePassengerAccountAfterPhoneVerification } =
  require('./passenger-account.service');

module.exports = {
  resolvePassengerAccountAfterPhoneVerification,
};
