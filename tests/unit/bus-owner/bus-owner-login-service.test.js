'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const tokenService = require('../../../utils/tokenService');
const phoneGuard = require('../../../utils/phoneGuard');
const service = require('../../../src/modules/bus-owner/auth/login/bus-owner-login.service');
const repository = require('../../../src/modules/bus-owner/auth/login/bus-owner-login.repository');

const patch = (obj, key, fn, restore) => {
  const old = obj[key];
  obj[key] = fn;
  restore.push(() => { obj[key] = old; });
};
const user = (fields = {}) => ({
  _id: 'u1',
  phone: '9814500001',
  password: 'hash',
  role: 'busOwner',
  roles: ['busOwner'],
  status: 'active',
  toObject: () => ({ _id: 'u1', password: 'hash', status: 'active' }),
  ...fields,
});

test('bus-owner-login service orchestration tests', async (t) => {
  await t.test('successful login order and arguments', async () => {
    const restore = [];
    const order = [];
    const u = user();
    patch(phoneGuard, 'normalizePhone', (p) => { order.push('normalize'); return `n-${p}`; }, restore);
    patch(repository, 'findLoginUser', async (n, raw) => { order.push(`lookup:${n}:${raw}`); return u; }, restore);
    patch(bcrypt, 'compare', async (pw, h) => { order.push(`compare:${pw}:${h}`); return true; }, restore);
    patch(repository, 'resetLoginSecurityState', async (id, d) => {
      order.push(`reset:${id}:${d instanceof Date}`);
    }, restore);
    patch(tokenService, 'generateTokenPair', async (doc, meta) => {
      order.push(`token:${doc === u}:${JSON.stringify(meta)}`);
      return { accessToken: 'at', refreshToken: 'rt' };
    }, restore);
    try {
      const result = await service.login({ rawPhone: 'raw', password: 'pw', deviceInfo: 'UA', ipAddress: 'IP' });
      assert.deepEqual(order, [
        'normalize',
        'lookup:n-raw:raw',
        'compare:pw:hash',
        'reset:u1:true',
        'token:true:{"deviceInfo":"UA","ipAddress":"IP","activeRole":"busOwner"}',
      ]);
      assert.equal(result.refreshToken, 'rt');
      assert.equal(result.responseBody.refreshToken, undefined);
      assert.equal(result.responseBody.user.password, undefined);
      assert.equal(result.responseBody.activeRole, 'busOwner');
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('invalid password increments, optionally locks, stops tokens', async () => {
    const restore = [];
    const order = [];
    const realNow = Date.now;
    patch(repository, 'findLoginUser', async () => { order.push('lookup'); return user(); }, restore);
    patch(bcrypt, 'compare', async () => { order.push('compare'); return false; }, restore);
    patch(repository, 'incrementFailedLoginAttempts', async () => {
      order.push('inc'); return { failedLoginAttempts: 5 };
    }, restore);
    patch(repository, 'lockAccount', async (id, lockedUntil) => {
      order.push(`lock:${id}:${lockedUntil.getTime() - realNow()}`);
    }, restore);
    patch(repository, 'resetLoginSecurityState', async () => { order.push('reset'); }, restore);
    patch(jwt, 'sign', () => { order.push('jwt'); return 'temp'; }, restore);
    patch(tokenService, 'generateTokenPair', async () => { order.push('token'); }, restore);
    try {
      await assert.rejects(() => service.login({ rawPhone: 'p', password: 'bad' }), {
        statusCode: 401,
        responseBody: { success: false, message: 'Too many failed attempts. Account locked for 15 minutes.' },
      });
      assert.equal(order[0], 'lookup');
      assert.equal(order[1], 'compare');
      assert.equal(order[2], 'inc');
      assert.match(order[3], /^lock:u1:/);
      assert.equal(order.includes('reset'), false);
      assert.equal(order.includes('jwt'), false);
      assert.equal(order.includes('token'), false);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('toObject failure remains an unexpected service failure', async () => {
    const restore = [];
    patch(repository, 'findLoginUser', async () => user({
      toObject: () => { throw new Error('toObject failed'); },
    }), restore);
    patch(bcrypt, 'compare', async () => true, restore);
    patch(repository, 'resetLoginSecurityState', async () => {}, restore);
    patch(tokenService, 'generateTokenPair', async () => ({ accessToken: 'at', refreshToken: 'rt' }), restore);
    try {
      await assert.rejects(
        () => service.login({ rawPhone: 'p', password: 'pw' }),
        /toObject failed/
      );
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('force-password branch signs temp token and skips reset/tokenPair', async () => {
    const restore = [];
    const order = [];
    patch(repository, 'findLoginUser', async () => { order.push('lookup'); return user({ forcePasswordChange: true }); }, restore);
    patch(bcrypt, 'compare', async () => { order.push('compare'); return true; }, restore);
    patch(jwt, 'sign', (payload, secret, opts) => {
      order.push(JSON.stringify({ payload, secret, opts })); return 'temp';
    }, restore);
    patch(repository, 'resetLoginSecurityState', async () => { order.push('reset'); }, restore);
    patch(tokenService, 'generateTokenPair', async () => { order.push('token'); }, restore);
    try {
      const result = await service.login({ rawPhone: 'p', password: 'pw' });
      assert.equal(result.responseBody.tempToken, 'temp');
      assert.deepEqual(order, [
        'lookup',
        'compare',
        JSON.stringify({ payload: {
          id: 'u1',
          purpose: 'FORCE_PASSWORD_CHANGE',
          activeRole: 'busOwner',
          credentialVersion: 0,
          tokenVersion: 0,
        }, secret: process.env.SECRET_KEY, opts: { expiresIn: '15m' } }),
      ]);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('production login module has no profile dependency', () => {
    const dir = path.join(process.cwd(), 'src/modules/bus-owner/auth/login');
    const source = fs.readdirSync(dir)
      .filter((file) => file.endsWith('.js'))
      .map((file) => fs.readFileSync(path.join(dir, file), 'utf8'))
      .join('\n');
    const blocked = [
      /busOwnerModel/,
      /require\([^)]*busOwnerModel[^)]*\)/,
      /from\s+['"][^'"]*busOwnerModel['"]/,
      /verificationStatus/,
    ];
    assert.equal(blocked.some((pattern) => pattern.test(source)), false);
  });
});
