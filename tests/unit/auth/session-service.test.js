'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const sessionService = require('../../../src/modules/auth/session/session.service');
const tokenService = require('../../../utils/tokenService');
const AppError = require('../../../src/shared/errors/app-error');

// All mapped error codes defined in session.errors.js
const MAPPED_ERRORS = [
  { code: 'INVALID_REFRESH_TOKEN', status: 401, msg: 'Invalid or revoked refresh token. Please login again.' },
  { code: 'REFRESH_TOKEN_EXPIRED',  status: 401, msg: 'Refresh token expired. Please login again.' },
  { code: 'USER_NOT_FOUND',         status: 401, msg: 'User not found. Please login again.' },
  { code: 'ACCOUNT_DEACTIVATED',    status: 403, msg: 'This account has been deactivated. Contact support.' },
  { code: 'ACCOUNT_BANNED',         status: 403, msg: 'Your account has been banned. Contact support.' },
  { code: 'ROLE_REVOKED',           status: 403, msg: 'Your role has been revoked. Please login again.' },
];

test('Auth: Session Service – refresh', async (t) => {
  const originalRotate = tokenService.rotateRefreshToken;

  t.afterEach(() => {
    tokenService.rotateRefreshToken = originalRotate;
  });

  await t.test('refreshSession – missing refresh token → AppError 400', async () => {
    await assert.rejects(
      () => sessionService.refreshSession({}),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 400);
        assert.equal(err.message, 'Refresh token is required.');
        assert.deepEqual(err.responseBody, { success: false, message: 'Refresh token is required.' });
        return true;
      }
    );
  });

  await t.test('refreshSession – success returns tokens and 200', async () => {
    tokenService.rotateRefreshToken = async () => ({ accessToken: 'acc', refreshToken: 'ref' });

    const result = await sessionService.refreshSession({
      refreshToken: 'some_token',
      deviceInfo: 'agent',
      ipAddress: '127.0.0.1',
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.refreshToken, 'ref');
    assert.equal(result.responseBody.success, true);
    assert.equal(result.responseBody.message, 'Token refreshed successfully.');
    assert.equal(result.responseBody.accessToken, 'acc');
  });

  for (const { code, status, msg } of MAPPED_ERRORS) {
    await t.test(`refreshSession – ${code} → AppError ${status}`, async () => {
      tokenService.rotateRefreshToken = async () => { throw new Error(code); };

      await assert.rejects(
        () => sessionService.refreshSession({ refreshToken: 'tok' }),
        (err) => {
          assert.ok(err instanceof AppError, `expected AppError, got ${err.constructor.name}`);
          assert.equal(err.statusCode, status);
          assert.equal(err.message, msg);
          assert.deepEqual(err.responseBody, { success: false, message: msg });
          return true;
        }
      );
    });
  }

  await t.test('refreshSession – unknown error → legacy 500 AppError with cause', async () => {
    const dbErr = new Error('db connection failure');
    tokenService.rotateRefreshToken = async () => { throw dbErr; };

    await assert.rejects(
      () => sessionService.refreshSession({ refreshToken: 'tok' }),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 500);
        assert.equal(err.message, 'Internal Server Error');
        assert.deepEqual(err.responseBody, { success: false, message: 'Internal Server Error' });
        assert.equal(err.cause, dbErr);
        return true;
      }
    );
  });
});
