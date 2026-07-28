'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const tokenService = require('../../../utils/tokenService');
const repository = require('../../../src/modules/bus-owner/auth/session/bus-owner-session.repository');
const service = require('../../../src/modules/bus-owner/auth/session/bus-owner-session.service');

const patch = (obj, name, fn, restores) => {
  const orig = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = orig; });
};

test('bus-owner session service preserves token boundaries and order', async (t) => {
  await t.test('rotateSession forwards exact token and null metadata fallbacks', async () => {
    const restores = [];
    let args;
    patch(tokenService, 'rotateRefreshToken', async (...x) => {
      args = x;
      return { accessToken: 'a', refreshToken: 'r', user: { id: 'u' } };
    }, restores);
    try {
      const result = await service.rotateSession({
        refreshToken: 'tok',
        deviceInfo: 'UA',
        ipAddress: '1.1.1.1',
      });
      assert.deepEqual(args, ['tok', { deviceInfo: 'UA', ipAddress: '1.1.1.1' }]);
      assert.deepEqual(result, { accessToken: 'a', refreshToken: 'r', user: { id: 'u' } });
      await service.rotateSession({ refreshToken: 'tok2' });
      assert.deepEqual(args, ['tok2', { deviceInfo: null, ipAddress: null }]);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('revokeSessionToken revokes one token only when present', async () => {
    const restores = [];
    const calls = [];
    patch(tokenService, 'revokeRefreshToken', async (token) => calls.push(token), restores);
    patch(tokenService, 'revokeAllUserTokens', async () => assert.fail('no revoke all'), restores);
    try {
      await service.revokeSessionToken('tok');
      await service.revokeSessionToken(null);
      assert.deepEqual(calls, ['tok']);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('invalidateAccessToken delegates only when userId exists', async () => {
    const restores = [];
    const calls = [];
    patch(repository, 'incrementTokenVersion', async (id) => calls.push(id), restores);
    try {
      await service.invalidateAccessToken('user-1');
      await service.invalidateAccessToken(undefined);
      assert.deepEqual(calls, ['user-1']);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('service imports tokenService but not the User model', () => {
    const source = fs.readFileSync(
      'src/modules/bus-owner/auth/session/bus-owner-session.service.js',
      'utf8',
    );
    assert.equal(source.includes('tokenService'), true);
    assert.equal(source.includes('userModel'), false);
  });
});
