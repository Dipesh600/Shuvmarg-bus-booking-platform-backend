"use strict";
const { test, assert, bcrypt, phoneGuard, otpHelper, enumGuard, passwordValidator, tokenService, repository, service, patch, driver, activeTarget } = require("../../helpers/driver-password-reset-service-harness");

test('driver reset consumes its OTP, rotates credentials and issues a driver session', async () => {
  const restores = [];
  const user = driver();
  const target = activeTarget(user);
  const calls = [];
  patch(phoneGuard, 'normalizePhone', () => user.phone, restores);
  patch(passwordValidator, 'validatePassword', () => ({ valid: true }), restores);
  patch(enumGuard, 'otpFirstVerify', async (phone, otp, purpose, consume) => {
    calls.push(`verify:${phone}:${otp}:${purpose}:${consume}`);
    return { valid: true, user: target };
  }, restores);
  patch(bcrypt, 'hash', async (password, cost) => {
    calls.push(`hash:${password}:${cost}`);
    return 'new-hash';
  }, restores);
  patch(repository, 'completePasswordReset', async (input) => {
    calls.push(`save:${input.userId}:${input.hashedPassword}`);
    return user;
  }, restores);
  patch(tokenService, 'revokeAllUserTokens', async (id) => calls.push(`revoke:${id}`), restores);
  patch(tokenService, 'generateTokenPair', async (_user, meta) => {
    calls.push(`session:${meta.activeRole}`);
    return { accessToken: 'access', refreshToken: 'refresh' };
  }, restores);
  try {
    const result = await service.resetPassword({
      rawPhone: user.phone,
      otp: '123456',
      newPassword: 'NewPassword123!',
      deviceInfo: 'device',
      ipAddress: '127.0.0.1',
    });
    assert.equal(result.responseBody.activeRole, 'driver');
    assert.equal(result.responseBody.accessToken, 'access');
    assert.equal(result.refreshToken, 'refresh');
    assert.deepEqual(calls, [
      'verify:9800001001:123456:DRIVER_PASSWORD_RESET:true',
      'hash:NewPassword123!:12',
      'save:driver-user:new-hash',
      'revoke:driver-user',
      'session:driver',
    ]);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
