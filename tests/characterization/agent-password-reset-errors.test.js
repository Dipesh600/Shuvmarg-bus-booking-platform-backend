'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const db = require('../helpers/db');
const app = require('../helpers/app');
const service = require('../../src/modules/agent/auth/password-reset/agent-password-reset.service');

const patch = (obj, key, fn) => {
  const old = obj[key];
  obj[key] = fn;
  return () => { obj[key] = old; };
};

test('agent password reset route-level generic error contracts', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('controller catches unexpected errors with endpoint-specific bodies', async () => {
    const cases = [
      ['requestPasswordReset', '/api/auth/agent/requestPasswordReset', { phone: '9818400001' }, 'Failed to send OTP. Please try again.'],
      ['verifyOtpForReset', '/api/auth/agent/verifyOtpForReset', { phone: '9818400002', otp: '123456' }, 'Internal Server Error'],
      ['resetPassword', '/api/auth/agent/resetPassword', { phone: '9818400003', otp: '123456', newPassword: 'NewPass123!' }, 'Internal Server Error'],
      ['resendOtpForReset', '/api/auth/agent/resendOtpForReset', { phone: '9818400004' }, 'Failed to resend code. Please try again.'],
    ];
    for (const [method, path, body, message] of cases) {
      const restore = patch(service, method, async () => { throw new Error('boom'); });
      try {
        const res = await request(app).post(path).send(body);
        assert.equal(res.status, 500);
        assert.deepEqual(res.body, { success: false, message });
      } finally { restore(); }
    }
  });
});
