'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.SECRET_KEY = 'test-only-secret-32chars-minimum!!';
process.env.NODE_ENV = 'test';

const service = require('../../../src/modules/auth/password-reset/reset-password.service');
const repository = require('../../../src/modules/auth/password-reset/password-reset.repository');
const otpHelper = require('../../../utils/otpHelper');
const tokenService = require('../../../utils/tokenService');

const GOOD_PW = 'NewPass1';

const stubOtpValid = () => {
  const orig = otpHelper.verifyOTPCode;
  otpHelper.verifyOTPCode = async () => ({ valid: true });
  return () => { otpHelper.verifyOTPCode = orig; };
};
const stubFindUser = (user = { _id: 'uid' }) => {
  const orig = repository.findActiveForPasswordReset;
  repository.findActiveForPasswordReset = async () => user;
  return () => { repository.findActiveForPasswordReset = orig; };
};
const stubSaveRevoke = () => {
  const origSave = repository.savePassword;
  const origRev = tokenService.revokeAllUserTokens;
  const origInc = repository.incrementTokenVersion;
  repository.savePassword = async () => {};
  tokenService.revokeAllUserTokens = async () => {};
  repository.incrementTokenVersion = async () => {};
  return () => {
    repository.savePassword = origSave;
    tokenService.revokeAllUserTokens = origRev;
    repository.incrementTokenVersion = origInc;
  };
};

test('Unit: resetPassword service', async (t) => {
  await t.test('missing emailOrPhone → 400', async () => {
    try { await service.resetPassword({ emailOrPhone: '', otp: '123456', newPassword: GOOD_PW }); assert.fail(); }
    catch (e) { assert.equal(e.statusCode, 400); assert.equal(e.responseBody.message, 'All fields are required.'); }
  });

  await t.test('invalid sanitized OTP length → 400', async () => {
    try { await service.resetPassword({ emailOrPhone: 'p', otp: '12', newPassword: GOOD_PW }); assert.fail(); }
    catch (e) { assert.equal(e.statusCode, 400); assert.equal(e.responseBody.message, 'Verification code must be 6 digits.'); }
  });

  await t.test('OTP verified with PURPOSE PASSWORD_RESET and markUsed=true', async () => {
    const orig = otpHelper.verifyOTPCode;
    let capturedPurpose, capturedMarkUsed;
    otpHelper.verifyOTPCode = async (p, o, purpose, markUsed) => {
      capturedPurpose = purpose; capturedMarkUsed = markUsed; return { valid: false, error: 'bad' };
    };
    try { await service.resetPassword({ emailOrPhone: '9800005501', otp: '123456', newPassword: GOOD_PW }); } catch (_) {}
    finally { otpHelper.verifyOTPCode = orig; }
    assert.equal(capturedPurpose, 'PASSWORD_RESET');
    assert.equal(capturedMarkUsed, true);
  });

  await t.test('invalid OTP → 400 with otpResult.error', async () => {
    const orig = otpHelper.verifyOTPCode;
    otpHelper.verifyOTPCode = async () => ({ valid: false, error: 'Expired.' });
    try {
      const r = await service.resetPassword({ emailOrPhone: '9800005502', otp: '123456', newPassword: GOOD_PW });
      assert.equal(r.statusCode, 400); assert.equal(r.responseBody.message, 'Expired.');
    } finally { otpHelper.verifyOTPCode = orig; }
  });

  await t.test('user lookup happens only after OTP succeeds', async () => {
    const origVerify = otpHelper.verifyOTPCode;
    const origFind = repository.findActiveForPasswordReset;
    let lookupCalled = false;
    otpHelper.verifyOTPCode = async () => ({ valid: false, error: 'bad' });
    repository.findActiveForPasswordReset = async () => { lookupCalled = true; return null; };
    try { await service.resetPassword({ emailOrPhone: '9800005503', otp: '123456', newPassword: GOOD_PW }); }
    finally { otpHelper.verifyOTPCode = origVerify; repository.findActiveForPasswordReset = origFind; }
    assert.equal(lookupCalled, false);
  });

  await t.test('user not found after OTP → 400', async () => {
    const restoreVerify = stubOtpValid();
    const origFind = repository.findActiveForPasswordReset;
    repository.findActiveForPasswordReset = async () => null;
    try {
      const r = await service.resetPassword({ emailOrPhone: '9800005504', otp: '123456', newPassword: GOOD_PW });
      assert.equal(r.statusCode, 400); assert.equal(r.responseBody.message, 'No account found with this phone or email.');
    } finally { restoreVerify(); repository.findActiveForPasswordReset = origFind; }
  });

  await t.test('weak password is rejected after OTP consumed', async () => {
    const restoreVerify = stubOtpValid();
    const restoreFind = stubFindUser();
    try {
      const r = await service.resetPassword({ emailOrPhone: '9800005505', otp: '123456', newPassword: 'weak' });
      assert.equal(r.statusCode, 400);
    } finally { restoreVerify(); restoreFind(); }
  });

  await t.test('bcrypt called with cost 12', async () => {
    const bcrypt = require('bcryptjs');
    const origHash = bcrypt.hash;
    let capturedCost;
    bcrypt.hash = async (pw, cost) => { capturedCost = cost; return 'hashed'; };
    const restoreVerify = stubOtpValid();
    const restoreFind = stubFindUser();
    const restoreSave = stubSaveRevoke();
    try {
      await service.resetPassword({ emailOrPhone: '9800005506', otp: '123456', newPassword: GOOD_PW });
      assert.equal(capturedCost, 12);
    } finally { bcrypt.hash = origHash; restoreVerify(); restoreFind(); restoreSave(); }
  });

  await t.test('revoke before increment — order enforced', async () => {
    const restoreVerify = stubOtpValid();
    const restoreFind = stubFindUser();
    const origSave = repository.savePassword; repository.savePassword = async () => {};
    const origRev = tokenService.revokeAllUserTokens;
    const origInc = repository.incrementTokenVersion;
    const order = [];
    tokenService.revokeAllUserTokens = async () => { order.push('revoke'); };
    repository.incrementTokenVersion = async () => { order.push('inc'); };
    try {
      await service.resetPassword({ emailOrPhone: '9800005507', otp: '123456', newPassword: GOOD_PW });
      assert.deepEqual(order, ['revoke', 'inc']);
    } finally {
      restoreVerify(); restoreFind(); repository.savePassword = origSave;
      tokenService.revokeAllUserTokens = origRev; repository.incrementTokenVersion = origInc;
    }
  });

  await t.test('success → 200 body', async () => {
    const restoreVerify = stubOtpValid();
    const restoreFind = stubFindUser();
    const restoreSave = stubSaveRevoke();
    try {
      const r = await service.resetPassword({ emailOrPhone: '9800005509', otp: '123456', newPassword: GOOD_PW });
      assert.equal(r.statusCode, 200); assert.equal(r.responseBody.status, true);
    } finally { restoreVerify(); restoreFind(); restoreSave(); }
  });
});
