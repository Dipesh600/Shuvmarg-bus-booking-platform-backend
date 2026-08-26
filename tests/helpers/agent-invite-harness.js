'use strict';

/**
 * Collaborator harness for the bus-owner agent-invite service.
 *
 * Lives here rather than inside one test file because three suites need the same
 * wiring — the happy path, the refusals, and the existing-account recovery — and
 * a copy per suite would let them drift into testing three slightly different
 * services.
 */

const assert = require('node:assert/strict');

// The SMS handler exports a bare function, so it cannot be patched through a
// module object like the other collaborators. Replace it in the require cache
// *before* the service is loaded — which is why this module owns the service
// require too, and why a test file must require this helper first. node --test
// gives each file its own process, so none of this leaks into another suite.
const smsPath = require.resolve('../../handlers/sparro-otp.js');
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

const phoneGuard = require('../../utils/phoneGuard');
const repository = require('../../src/modules/bus-owner/agent-invite/bus-owner-agent-invite.repository');
const service = require('../../src/modules/bus-owner/agent-invite/bus-owner-agent-invite.service');

const OWNER_ID = '507f1f77bcf86cd799439011';
const validBody = { name: 'Ram Bahadur', phone: '9800000000' };

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

/** Asserts the call was refused with a given status, and optionally a message. */
const rejects = async (promise, statusCode, matcher) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.statusCode, statusCode);
    if (matcher) assert.match(error.responseBody.message, matcher);
    return true;
  });
};

module.exports = { OWNER_ID, harness, rejects, service, smsCalls, validBody };
