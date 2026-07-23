'use strict';

/**
 * src/modules/auth/passenger-otp-auth/index.js
 *
 * Public surface of the passenger OTP authentication module.
 * Exports only the controller methods required by the route layer.
 */

const { sendOTP, verifyOTP } = require('./passenger-otp-auth.controller');

module.exports = { sendOTP, verifyOTP };
