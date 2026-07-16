'use strict';

const bcrypt = require('bcryptjs');
const phoneGuard = require('../../../../utils/phoneGuard');
const otpHelper = require('../../../../utils/otpHelper');
const tokenService = require('../../../../utils/tokenService');
const passwordValidator = require('../../../../utils/passwordValidator');
const repository = require('./password-reset.repository');
const policy = require('./password-reset.policy');
const errors = require('./password-reset.errors');

/**
 * Preserves the exact legacy resetPassword behavior.
 *
 * Operation order (must not be changed):
 *  1. validate required fields
 *  2. normalize emailOrPhone
 *  3. sanitize OTP
 *  4. verify AND consume OTP (markUsed = true)
 *  5. if invalid OTP → return error (OTP already consumed)
 *  6. find active user
 *  7. if no user → return error (OTP already consumed — no replay risk)
 *  8. validate new password strength
 *  9. bcrypt.hash(newPassword, 12)
 * 10. save hashed password
 * 11. revokeAllUserTokens
 * 12. incrementTokenVersion
 * 13. return success
 *
 * @param {{ emailOrPhone: string, otp: string|number, newPassword: string }} input
 * @returns {{ statusCode: number, responseBody: object }}
 */
const resetPassword = async ({ emailOrPhone, otp, newPassword }) => {
  try {
    policy.validateResetInput(emailOrPhone, otp, newPassword);                         // 1
    const normalizedPhone = phoneGuard.normalizePhone(emailOrPhone);                   // 2
    const cleanOtp = policy.sanitizeOtp(otp, 'Verification code must be 6 digits.');  // 3

    const lookupPhone = normalizedPhone || emailOrPhone;
    const otpResult = await otpHelper.verifyOTPCode(                                  // 4
      lookupPhone, cleanOtp, 'PASSWORD_RESET', true
    );
    if (!otpResult.valid) {                                                            // 5
      return { statusCode: 400, responseBody: { status: false, message: otpResult.error } };
    }

    const user = await repository.findActiveForPasswordReset(emailOrPhone, normalizedPhone); // 6
    if (!user) {                                                                       // 7
      return {
        statusCode: 400,
        responseBody: { status: false, message: 'No account found with this phone or email.' },
      };
    }

    const passwordCheck = passwordValidator.validatePassword(newPassword);             // 8
    if (!passwordCheck.valid) {
      return {
        statusCode: 400,
        responseBody: { status: false, message: passwordCheck.errors[0], errors: passwordCheck.errors },
      };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);                        // 9
    await repository.savePassword(user, hashedPassword);                              // 10
    await tokenService.revokeAllUserTokens(user._id);                                 // 11
    await repository.incrementTokenVersion(user._id);                                 // 12

    return {                                                                           // 13
      statusCode: 200,
      responseBody: {
        status: true,
        message: 'Password reset successful. Please log in with your new password.',
      },
    };
  } catch (err) {
    if (err.statusCode) throw err;
    console.error('resetPassword error:', err.message);
    throw errors.resetFailError();
  }
};

module.exports = { resetPassword };
