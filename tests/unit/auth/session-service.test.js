const test = require('node:test');
const assert = require('node:assert/strict');

const sessionService = require('../../../src/modules/auth/session/session.service');
const sessionRepository = require('../../../src/modules/auth/session/session.repository');
const tokenService = require('../../../utils/tokenService');
const AppError = require('../../../src/shared/errors/app-error');

test('Auth: Session Service', async (t) => {
  const originalRotate = tokenService.rotateRefreshToken;
  const originalRevoke = tokenService.revokeRefreshToken;
  const originalIncrement = sessionRepository.incrementTokenVersion;

  t.afterEach(() => {
    tokenService.rotateRefreshToken = originalRotate;
    tokenService.revokeRefreshToken = originalRevoke;
    sessionRepository.incrementTokenVersion = originalIncrement;
  });

  await t.test('refreshSession - success', async () => {
    tokenService.rotateRefreshToken = async () => ({
      accessToken: 'acc_token',
      refreshToken: 'ref_token',
    });

    try {
      const result = await sessionService.refreshSession({
        refreshToken: 'some_token',
        deviceInfo: 'agent',
        ipAddress: '127.0.0.1'
      });

      assert.equal(result.statusCode, 200);
      assert.equal(result.responseBody.success, true);
      assert.equal(result.responseBody.message, 'Token refreshed successfully.');
      assert.equal(result.responseBody.accessToken, 'acc_token');
      assert.equal(result.refreshToken, 'ref_token');
    } catch (err) {
      console.log("SUCCESS TEST THREW:", err.cause || err);
      throw err;
    }
  });

  await t.test('refreshSession - handles specific token service error', async () => {
    tokenService.rotateRefreshToken = async () => {
      throw new Error('INVALID_REFRESH_TOKEN');
    };

    try {
      await sessionService.refreshSession({ refreshToken: 'some_token' });
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 401);
      assert.equal(error.message, 'Invalid or revoked refresh token. Please login again.');
    }
  });

  await t.test('refreshSession - handles unmapped unexpected error', async () => {
    const dbError = new Error('Database connection failed');
    tokenService.rotateRefreshToken = async () => {
      throw dbError;
    };

    try {
      await sessionService.refreshSession({ refreshToken: 'some_token' });
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 500);
      assert.equal(error.message, 'Internal Server Error');
      assert.equal(error.cause, dbError);
    }
  });

  await t.test('logoutSession - succeeds even if revoke throws', async () => {
    let incrementCalled = false;
    tokenService.revokeRefreshToken = async () => {
      throw new Error('Some DB error during revoke');
    };
    sessionRepository.incrementTokenVersion = async () => {
      incrementCalled = true;
    };

    const originalConsoleError = console.error;
    console.error = () => {}; // suppress error output for test
    try {
      const result = await sessionService.logoutSession({
        refreshToken: 'token',
        userId: '123'
      });
      assert.equal(result.statusCode, 200);
      assert.equal(result.responseBody.success, true);
      assert.equal(result.clearCookie, 'refreshToken');
      assert.equal(incrementCalled, false);
    } finally {
      console.error = originalConsoleError;
    }
  });
});
