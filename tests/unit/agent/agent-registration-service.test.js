'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET ||= 'test-only-verification-secret!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const phoneGuard = require('../../../utils/phoneGuard');
const otpHelper = require('../../../utils/otpHelper');
const passwordValidator = require('../../../utils/passwordValidator');
const tokenService = require('../../../utils/tokenService');
const verificationToken = require('../../../utils/verificationToken');
const service = require('../../../src/modules/agent/auth/registration/agent-registration.service');
const repository = require('../../../src/modules/agent/auth/registration/agent-registration.repository');
const leadRepository = require('../../../src/modules/agent/auth/registration/agent-registration-lead.repository');

const patch = (obj, key, fn, restore) => {
  const old = obj[key];
  obj[key] = fn;
  restore.push(() => { obj[key] = old; });
};
const user = (fields = {}) => ({
  _id: 'u1',
  name: 'Agent',
  phone: '9817600001',
  role: 'passenger',
  roles: ['passenger'],
  status: 'active',
  toObject: () => ({ _id: 'u1', phone: '9817600001', password: 'hash' }),
  ...fields,
});

test('agent-registration service preserves orchestration', async (t) => {
  await t.test('sendOTP normalizes, validates, checks role, sends AGENT_REGISTRATION', async () => {
    const restore = [];
    const order = [];
    patch(phoneGuard, 'normalizePhone', (p) => { order.push(`normalize:${p}`); return '9817600001'; }, restore);
    patch(phoneGuard, 'checkPhoneForRole', async (p, role) => {
      order.push(`role:${p}:${role}`); return { exists: false, hasRole: false, user: null };
    }, restore);
    patch(otpHelper, 'createAndSendOTP', async (p, purpose) => { order.push(`otp:${p}:${purpose}`); }, restore);
    try {
      const result = await service.sendOTP({ rawPhone: '+9779817600001' });
      assert.deepEqual(order, [
        'normalize:+9779817600001',
        'role:9817600001:agent',
        'otp:9817600001:AGENT_REGISTRATION',
      ]);
      assert.equal(result.statusCode, 200);
      assert.match(result.responseBody.message, /eligible/);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('verifyOTP sanitizes, verifies, checks race, writes lead and returns roles/token', async () => {
    const restore = [];
    const order = [];
    patch(phoneGuard, 'normalizePhone', (p) => p, restore);
    patch(otpHelper, 'verifyOTPCode', async (p, otp, purpose) => {
      order.push(`verify:${p}:${otp}:${purpose}`); return { valid: true };
    }, restore);
    patch(phoneGuard, 'checkPhoneForRole', async () => ({
      exists: true, hasRole: false, user: user({ roles: [], role: 'busOwner' }),
    }), restore);
    patch(leadRepository, 'upsertOtpVerifiedLead', (p) => {
      order.push(`lead:${p}`); return { catch: () => {} };
    }, restore);
    patch(verificationToken, 'issueVerificationToken', (p, purpose) => {
      order.push(`token:${p}:${purpose}`); return 'vt';
    }, restore);
    try {
      const result = await service.verifyOTP({ rawPhone: '9817600002', otp: 'a123456' });
      assert.deepEqual(order, [
        'verify:9817600002:123456:AGENT_REGISTRATION',
        'lead:9817600002',
        'token:9817600002:AGENT_REGISTRATION',
      ]);
      assert.deepEqual(result.responseBody.existingRoles, ['busOwner']);
      assert.equal(result.responseBody.verificationToken, 'vt');
    } finally { restore.reverse().forEach((fn) => fn()); }
  });

  await t.test('register new-user order, bcrypt cost, token metadata and lead conversion', async () => {
    const restore = [];
    const order = [];
    const saved = user();
    patch(phoneGuard, 'normalizePhone', (p) => p, restore);
    patch(verificationToken, 'validateVerificationToken', () => ({ valid: true }), restore);
    patch(repository, 'findConsumedOtp', async () => ({ updatedAt: new Date() }), restore);
    patch(phoneGuard, 'checkPhoneForRole', async () => { order.push('role'); return { exists: false }; }, restore);
    patch(passwordValidator, 'validatePassword', (pw) => { order.push(`validate:${pw}`); return { valid: true }; }, restore);
    patch(repository, 'findUserByEmail', async (e) => { order.push(`email:${e}`); return null; }, restore);
    patch(bcrypt, 'hash', async (pw, cost) => { order.push(`hash:${pw}:${cost}`); return 'hash'; }, restore);
    patch(repository, 'createUser', async (data) => { order.push(`create:${JSON.stringify(data.roles)}`); return saved; }, restore);
    patch(repository, 'upsertAgentProfile', async (id) => {
      order.push(`agent:${id}`); return { agentId: null, save: async () => order.push('agent-save') };
    }, restore);
    patch(tokenService, 'generateTokenPair', async (doc, meta) => {
      order.push(`tokens:${doc === saved}:${JSON.stringify(meta)}`);
      return { accessToken: 'at', refreshToken: 'rt' };
    }, restore);
    patch(leadRepository, 'convertOtpVerifiedLead', (p, name) => {
      order.push(`lead:${p}:${name}`); return { catch: () => {} };
    }, restore);
    try {
      const result = await service.register({
        rawPhone: '9817600001',
        name: ' Agent ',
        password: 'AgentPass123!',
        email: ' A@B.COM ',
        verificationToken: 'vt',
        deviceInfo: 'UA',
        ipAddress: 'IP',
      });
      assert.deepEqual(order, [
        'role',
        'validate:AgentPass123!',
        'email:a@b.com',
        'hash:AgentPass123!:12',
        'create:["agent"]',
        'agent:u1',
        'agent-save',
        'tokens:true:{"deviceInfo":"UA","ipAddress":"IP","activeRole":"agent"}',
        'lead:9817600001:Agent',
      ]);
      assert.equal(result.statusCode, 201);
      assert.equal(result.refreshToken, 'rt');
      assert.equal(result.responseBody.refreshToken, undefined);
      assert.equal(result.responseBody.user.password, undefined);
    } finally { restore.reverse().forEach((fn) => fn()); }
  });
});
