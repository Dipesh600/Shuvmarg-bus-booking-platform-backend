'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const controller = require('../../../src/modules/auth/profile/profile.controller');
const service = require('../../../src/modules/auth/profile/profile.service');
const AppError = require('../../../src/shared/errors/app-error');

const res = () => ({ code: null, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
const patch = (name, fn) => {
  const old = service[name];
  service[name] = fn;
  return () => { service[name] = old; };
};

test('profile controller forwards exact inputs and responses', async (t) => {
  await t.test('updateProfilePicture forwards optional userId and profilePic', async () => {
    let got;
    const restore = patch('updateProfilePicture', async (input) => {
      got = input; return { statusCode: 201, responseBody: { ok: true } };
    });
    try {
      const out = res();
      await controller.updateProfilePicture({
        userInfo: { id: 'u1' }, files: { profilePic: 'file' },
      }, out, assert.fail);
      assert.deepEqual(got, { userId: 'u1', profilePic: 'file' });
      assert.equal(out.code, 201);
      assert.deepEqual(out.body, { ok: true });
    } finally { restore(); }
  });

  await t.test('updateProfile forwards only supported body fields', async () => {
    let got;
    const restore = patch('updateProfile', async (input) => {
      got = input; return { statusCode: 202, responseBody: { done: true } };
    });
    try {
      const out = res();
      await controller.updateProfile({
        userInfo: { id: 'u2' }, body: { name: 'n', address: 'a', gender: 'g', extra: 'x' },
        files: { profilePic: 'pic' },
      }, out, assert.fail);
      assert.deepEqual(got, { userId: 'u2', name: 'n', address: 'a', gender: 'g', profilePic: 'pic' });
      assert.deepEqual(out.body, { done: true });
    } finally { restore(); }
  });

  await t.test('getUserDetail uses direct req.userInfo.id access', async () => {
    let got;
    const restore = patch('getUserDetail', async (input) => {
      got = input; return { statusCode: 200, responseBody: { status: true } };
    });
    try {
      await controller.getUserDetail({ userInfo: { id: 'u3' } }, res(), assert.fail);
      assert.deepEqual(got, { userId: 'u3' });
      let forwarded;
      await controller.getUserDetail({}, res(), (error) => { forwarded = error; });
      assert.match(forwarded.message, /id/);
    } finally { restore(); }
  });

  await t.test('service rejections are forwarded and no response is written', async () => {
    for (const error of [new AppError('expected', 400), new Error('generic')]) {
      const restore = patch('updateProfile', async () => { throw error; });
      try {
        const out = res();
        let nextError;
        await controller.updateProfile({ userInfo: {}, body: {}, files: {} }, out, (e) => { nextError = e; });
        assert.equal(nextError, error);
        assert.equal(out.code, null);
        assert.equal(out.body, null);
      } finally { restore(); }
    }
  });
});
