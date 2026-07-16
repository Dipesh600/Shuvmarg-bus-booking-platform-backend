'use strict';

/**
 * Constructs the success response body for sendPhoneOTP when an OTP was sent.
 */
const toSendOtpResponse = (result) => ({
  statusCode: 200,
  responseBody: {
    status: true,
    message: 'If this number is eligible, a verification code has been sent.',
    data: { expiresIn: result.expiresIn },
  },
});

/**
 * Constructs the enumeration-defence response for an already-registered phone.
 */
const toSendOtpRegisteredResponse = () => ({
  statusCode: 200,
  responseBody: {
    status: true,
    message: 'If this number is eligible, a verification code has been sent.',
  },
});

/**
 * Constructs the success response for verifyPhoneOTP.
 */
const toVerifyOtpSuccess = (verificationToken) => ({
  statusCode: 200,
  responseBody: {
    status: true,
    message: 'Phone verified successfully! Please complete your registration.',
    verificationToken,
  },
});

/**
 * Constructs the 201 success body for completeRegistration.
 */
const toCompleteRegistrationSuccess = (savedUser) => ({
  statusCode: 201,
  responseBody: {
    status: true,
    message: 'Registration completed successfully!',
    data: {
      userId: savedUser._id,
      phone: savedUser.phone,
      email: savedUser.email,
    },
  },
});

module.exports = {
  toSendOtpResponse,
  toSendOtpRegisteredResponse,
  toVerifyOtpSuccess,
  toCompleteRegistrationSuccess,
};
