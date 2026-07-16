'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const sessionService = require('../../../src/modules/auth/session/session.service');
const sessionRepository = require('../../../src/modules/auth/session/session.repository');
const tokenService = require('../../../utils/tokenService');

test('Auth: Session Service – logout', async (t) => {
  const originalRevoke = tokenService.revokeRefreshToken;
  const originalIncrement = sessionRepository.incrementTokenVersion;

  t.afterEach(() => {
    tokenService.revokeRefreshToken = originalRevoke;
    sessionRepository.incrementTokenVersion = originalIncrement;
  });

  await t.test('logoutSession – without token returns 200', async () => {
    let revokeCalled = false;
    tokenService.revokeRefreshToken = async () => { revokeCalled = true; };

    const result = await sessionService.logoutSession({});
    assert.equal(result.statusCode, 200);
    assert.equal(result.responseBody.success, true);
    assert.equal(result.responseBody.message, 'Logged out successfully.');
    assert.equal(revokeCalled, false);
  });

  await t.test('logoutSession – with token calls revokeRefreshToken', async () => {
    let revokeArg = null;
    tokenService.revokeRefreshToken = async (tok) => { revokeArg = tok; };
    sessionRepository.incrementTokenVersion = async () => {};

    await sessionService.logoutSession({ refreshToken: 'my-token' });
    assert.equal(revokeArg, 'my-token');
  });

  await t.test('logoutSession – with userId calls incrementTokenVersion', async () => {
    let incrementArg = null;
    tokenService.revokeRefreshToken = async () => {};
    sessionRepository.incrementTokenVersion = async (id) => { incrementArg = id; };

    await sessionService.logoutSession({ refreshToken: 'tok', userId: 'uid-123' });
    assert.equal(incrementArg, 'uid-123');
  });

  await t.test('logoutSession – successful incrementTokenVersion still returns 200', async () => {
    tokenService.revokeRefreshToken = async () => {};
    sessionRepository.incrementTokenVersion = async () => ({ nModified: 1 });

    const result = await sessionService.logoutSession({ refreshToken: 'tok', userId: 'uid' });
    assert.equal(result.statusCode, 200);
    assert.equal(result.responseBody.success, true);
  });

  await t.test('logoutSession – revoke failure still returns 200', async () => {
    tokenService.revokeRefreshToken = async () => { throw new Error('db error'); };
    const silenced = console.error;
    console.error = () => {};
    try {
      const result = await sessionService.logoutSession({ refreshToken: 'tok', userId: 'uid' });
      assert.equal(result.statusCode, 200);
      assert.equal(result.responseBody.success, true);
    } finally {
      console.error = silenced;
    }
  });

  await t.test('logoutSession – repository failure still returns 200', async () => {
    tokenService.revokeRefreshToken = async () => {};
    sessionRepository.incrementTokenVersion = async () => { throw new Error('repo error'); };
    const silenced = console.error;
    console.error = () => {};
    try {
      const result = await sessionService.logoutSession({ refreshToken: 'tok', userId: 'uid' });
      assert.equal(result.statusCode, 200);
      assert.equal(result.responseBody.success, true);
    } finally {
      console.error = silenced;
    }
  });

  await t.test('logoutSession – increment not attempted after revoke failure', async () => {
    let incrementCalled = false;
    tokenService.revokeRefreshToken = async () => { throw new Error('revoke failed'); };
    sessionRepository.incrementTokenVersion = async () => { incrementCalled = true; };

    const silenced = console.error;
    console.error = () => {};
    try {
      await sessionService.logoutSession({ refreshToken: 'tok', userId: 'uid' });
    } finally {
      console.error = silenced;
    }
    assert.equal(incrementCalled, false,
      'incrementTokenVersion must not be called after a revoke failure');
  });
});
