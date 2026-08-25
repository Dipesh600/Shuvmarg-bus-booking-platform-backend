'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// The SMS handler exports a bare function, so it cannot be patched through a
// module object like the other collaborators. Replace it in the require cache
// before the service is loaded. node --test gives each file its own process, so
// this does not leak into other suites.
const smsPath = require.resolve('../../../handlers/sparro-otp.js');
const smsCalls = [];
let smsBehaviour = async () => ({ ok: true });
require.cache[smsPath] = {
  id: smsPath,
  filename: smsPath,
  loaded: true,
  exports: async (...args) => {
    smsCalls.push(args);
    return smsBehaviour(...args);
  },
};

const phoneGuard = require('../../../utils/phoneGuard');
const repository = require('../../../src/modules/bus-owner/agent-invite/bus-owner-agent-invite.repository');
const service = require('../../../src/modules/bus-owner/agent-invite/bus-owner-agent-invite.service');

const OWNER_ID = '507f1f77bcf86cd799439011';
const patch = (obj, name, fn, restores) => {
  const original = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = original; });
};

/** Wires up every collaborator with a benign default; each test overrides one. */
const harness = (overrides = {}) => {
  const restores = [];
  const calls = { createUser: [], createAgent: [], addAgentRole: [], findOwnedBrand: [] };
  smsCalls.length = 0;
  smsBehaviour = overrides.sms || (async () => ({ ok: true }));

  patch(phoneGuard, 'checkPhoneForRole', overrides.checkPhoneForRole
    || (async () => ({ exists: false, hasRole: false, user: null })), restores);
  patch(repository, 'findOwnedBrand', async (...args) => {
    calls.findOwnedBrand.push(args);
    return overrides.brand === undefined ? null : overrides.brand;
  }, restores);
  patch(repository, 'findAgentByUserId', overrides.findAgentByUserId
    || (async () => null), restores);
  patch(repository, 'addAgentRole', async (...args) => {
    calls.addAgentRole.push(args);
    return { _id: args[0] };
  }, restores);
  patch(repository, 'createUser', async (...args) => {
    calls.createUser.push(args);
    return { _id: 'user-new', ...args[0] };
  }, restores);
  patch(repository, 'createAgent', overrides.createAgent || (async (...args) => {
    calls.createAgent.push(args);
    return { _id: 'agent-new', code: 'SM-AG-7K4QP2X', agentId: 'SHV-AG-KTM-001', ...args[0] };
  }), restores);

  return { calls, restore: () => restores.reverse().forEach((fn) => fn()) };
};

const validBody = { name: 'Ram Bahadur', phone: '9800000000' };

const rejects = async (promise, statusCode, matcher) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.statusCode, statusCode);
    if (matcher) assert.match(error.responseBody.message, matcher);
    return true;
  });
};

test('operator agent create — happy path', async (t) => {
  await t.test('creates an invited user, an agent, and returns the code', async () => {
    const h = harness();
    try {
      const result = await service.createAgent(OWNER_ID, validBody);
      assert.equal(result.statusCode, 201);
      assert.equal(result.responseBody.data.agentCode, 'SM-AG-7K4QP2X');
      assert.equal(result.responseBody.data.isUpgrade, false);
      assert.equal(result.responseBody.data.smsSent, true);

      assert.equal(h.calls.createUser.length, 1);
      assert.equal(h.calls.createUser[0][0].status, 'invited');
      assert.equal(h.calls.createAgent.length, 1);
      assert.equal(h.calls.createAgent[0][0].scope, 'OPERATOR');
      assert.equal(h.calls.createAgent[0][0].applicationStatus, 'DRAFT');
    } finally { h.restore(); }
  });

  await t.test('stamps the caller as creator, ignoring any ownerId in the body', async () => {
    const h = harness();
    try {
      await service.createAgent(OWNER_ID, {
        ...validBody,
        createdByOwnerId: '507f1f77bcf86cd799439099',
        ownerId: '507f1f77bcf86cd799439099',
      });
      assert.equal(h.calls.createAgent[0][0].createdByOwnerId, OWNER_ID);
    } finally { h.restore(); }
  });

  await t.test('sends the temp password by SMS and never returns it', async () => {
    const h = harness();
    try {
      const result = await service.createAgent(OWNER_ID, validBody);
      assert.equal(smsCalls.length, 1);
      const [phone, message] = smsCalls[0];
      assert.equal(phone, '9800000000');
      // The password in the SMS is the one that was hashed into the User, and it
      // appears nowhere in the HTTP response.
      const tempPassword = message.match(/Temp Password: ([A-F0-9]+)/)[1]; // ggignore
      assert.equal(tempPassword.length, 10);
      assert.doesNotMatch(JSON.stringify(result.responseBody), new RegExp(tempPassword));
    } finally { h.restore(); }
  });

  await t.test('hashes the password — the User never holds plaintext', async () => {
    const h = harness();
    try {
      await service.createAgent(OWNER_ID, validBody);
      const stored = h.calls.createUser[0][0].password;
      const tempPassword = smsCalls[0][1].match(/Temp Password: ([A-F0-9]+)/)[1]; // ggignore
      assert.notEqual(stored, tempPassword);
      assert.match(stored, /^\$2[aby]\$12\$/);
    } finally { h.restore(); }
  });

  await t.test('normalises the phone before writing it', async () => {
    const h = harness();
    try {
      await service.createAgent(OWNER_ID, { ...validBody, phone: '+977 9800000000' });
      assert.equal(h.calls.createUser[0][0].phone, '9800000000');
    } finally { h.restore(); }
  });
});

test('operator agent create — refusals', async (t) => {
  await t.test('a phone that is already an agent is refused with 409', async () => {
    const h = harness({
      checkPhoneForRole: async () => ({ exists: true, hasRole: true, user: { _id: 'user-1' } }),
      findAgentByUserId: async () => ({ _id: 'agent-1', code: 'SM-AG-EXISTING' }),
    });
    try {
      await rejects(service.createAgent(OWNER_ID, validBody), 409);
      assert.equal(h.calls.createAgent.length, 0);
      assert.equal(h.calls.createUser.length, 0);
      assert.equal(smsCalls.length, 0);
    } finally { h.restore(); }
  });

  await t.test('the 409 does not disclose the existing agent code or account', async () => {
    const h = harness({
      checkPhoneForRole: async () => ({ exists: true, hasRole: true, user: { _id: 'user-1' } }),
      findAgentByUserId: async () => ({ _id: 'agent-1', code: 'SM-AG-EXISTING' }),
    });
    try {
      await assert.rejects(service.createAgent(OWNER_ID, validBody), (error) => {
        const body = JSON.stringify(error.responseBody);
        assert.doesNotMatch(body, /SM-AG-EXISTING/);
        assert.doesNotMatch(body, /agent-1|user-1/);
        return true;
      });
    } finally { h.restore(); }
  });

  await t.test('a brandId the owner does not own is refused with 403', async () => {
    const h = harness({ brand: null });
    try {
      await rejects(
        service.createAgent(OWNER_ID, { ...validBody, brandId: '507f1f77bcf86cd799439030' }),
        403,
      );
      // Refused before anything was written.
      assert.equal(h.calls.createUser.length, 0);
      assert.equal(h.calls.createAgent.length, 0);
    } finally { h.restore(); }
  });

  await t.test('ownership is checked against the calling owner, in one query', async () => {
    const h = harness({ brand: { _id: 'brand-1', name: 'Kaski Yatayat' } });
    try {
      await service.createAgent(OWNER_ID, { ...validBody, brandId: 'brand-1' });
      assert.deepEqual(h.calls.findOwnedBrand[0], [OWNER_ID, 'brand-1']);
    } finally { h.restore(); }
  });

  await t.test('no brandId means no brand query and no brand in the response', async () => {
    const h = harness();
    try {
      const result = await service.createAgent(OWNER_ID, validBody);
      assert.equal(h.calls.findOwnedBrand.length, 0);
      assert.equal(result.responseBody.data.brand, null);
    } finally { h.restore(); }
  });

  await t.test('a non-Nepal mobile is refused before any DB write', async () => {
    const h = harness();
    try {
      await rejects(service.createAgent(OWNER_ID, { ...validBody, phone: '0145678901' }), 400);
      assert.equal(h.calls.createUser.length, 0);
      assert.equal(h.calls.createAgent.length, 0);
    } finally { h.restore(); }
  });

  await t.test('a missing name is refused with the field errors listed', async () => {
    const h = harness();
    try {
      await assert.rejects(service.createAgent(OWNER_ID, { phone: '9800000000' }), (error) => {
        assert.equal(error.statusCode, 400);
        assert.deepEqual(error.responseBody.errors, ['name is required.']);
        return true;
      });
    } finally { h.restore(); }
  });

  await t.test('a duplicate key from the unique index becomes a 409, not a 500', async () => {
    const duplicate = Object.assign(new Error('E11000'), {
      code: 11000,
      keyPattern: { user: 1 },
    });
    const h = harness({ createAgent: async () => { throw duplicate; } });
    try {
      await rejects(service.createAgent(OWNER_ID, validBody), 409);
    } finally { h.restore(); }
  });
});

test('operator agent create — existing account', async (t) => {
  await t.test('adds the agent role instead of creating a second User', async () => {
    const h = harness({
      checkPhoneForRole: async () => ({ exists: true, hasRole: false, user: { _id: 'user-1' } }),
    });
    try {
      const result = await service.createAgent(OWNER_ID, validBody);
      assert.equal(result.statusCode, 201);
      assert.equal(result.responseBody.data.isUpgrade, true);
      assert.equal(h.calls.addAgentRole.length, 1);
      assert.equal(h.calls.createUser.length, 0);
      assert.equal(h.calls.createAgent.length, 1);
    } finally { h.restore(); }
  });

  await t.test('does not SMS a password to an account that already has one', async () => {
    const h = harness({
      checkPhoneForRole: async () => ({ exists: true, hasRole: false, user: { _id: 'user-1' } }),
    });
    try {
      const result = await service.createAgent(OWNER_ID, validBody);
      assert.equal(smsCalls.length, 0);
      assert.equal(result.responseBody.data.smsSent, false);
      // Nothing to activate: the account is already the agent's own.
      assert.equal(result.responseBody.data.requiresAgentActivation, false);
    } finally { h.restore(); }
  });

  await t.test('recovers when the role exists but the profile does not', async () => {
    // A previous attempt that died between the two writes must not be a
    // permanent 409 that leaves the agent with no profile.
    const h = harness({
      checkPhoneForRole: async () => ({ exists: true, hasRole: true, user: { _id: 'user-1' } }),
      findAgentByUserId: async () => null,
    });
    try {
      const result = await service.createAgent(OWNER_ID, validBody);
      assert.equal(result.statusCode, 201);
      assert.equal(h.calls.createAgent.length, 1);
      assert.equal(h.calls.createUser.length, 0);
    } finally { h.restore(); }
  });
});

test('operator agent create — SMS delivery is best effort', async (t) => {
  await t.test('a failed SMS still returns 201 with the code', async () => {
    // The identity is written and has a code. Failing the request would leave a
    // usable agent behind an error, and the owner can read the code and resend.
    const h = harness({ sms: async () => { throw new Error('gateway down'); } });
    try {
      const result = await service.createAgent(OWNER_ID, validBody);
      assert.equal(result.statusCode, 201);
      assert.equal(result.responseBody.data.smsSent, false);
      assert.equal(result.responseBody.data.agentCode, 'SM-AG-7K4QP2X');
      assert.equal(h.calls.createAgent.length, 1);
    } finally { h.restore(); }
  });
});

test('temp password generation', async (t) => {
  await t.test('is 10 uppercase hex characters', () => {
    for (let i = 0; i < 20; i += 1) {
      assert.match(service.generateTempPassword(), /^[0-9A-F]{10}$/);
    }
  });

  await t.test('does not repeat', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) seen.add(service.generateTempPassword());
    assert.equal(seen.size, 200);
  });
});
