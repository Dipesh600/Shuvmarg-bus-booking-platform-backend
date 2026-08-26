'use strict';

/**
 * Runs the agent identity service against a stubbed repository.
 *
 * Every case here turns on what the repository handed back and how many times the
 * service wrote, so the repository is the seam: no database, and the save count is
 * an assertion rather than something to infer.
 */

const repository = require('../../src/modules/agent/identity/agent-identity.repository');
const service = require('../../src/modules/agent/identity/agent-identity.service');
const { agentDoc, user } = require('./agent-identity-fixtures');

/**
 * Stub the repository around one agent/user pair.
 *
 * Pass `userDoc` to control the user projection exactly — including omitting
 * `phoneVerified`, which is the case the derivation has to survive. `user`
 * overrides fields on the complete fixture instead.
 *
 * Always call `restore()` in a finally: the repository module is shared.
 */
const harness = ({ agent: agentFields = {}, user: userFields = {}, userDoc } = {}) => {
  const original = { ...repository };
  const agent = agentDoc(agentFields);
  const loaded = userDoc === undefined ? user(userFields) : userDoc;
  const calls = { saves: 0, names: [] };

  repository.findAgentByUserId = async () => agent;
  repository.findUserById = async () => loaded;
  repository.saveAgent = async (doc) => { calls.saves += 1; return doc; };
  repository.updateUserName = async (userId, name) => {
    calls.names.push(name);
    return { ...loaded, name };
  };

  return {
    agent,
    calls,
    user: loaded,
    restore: () => { Object.assign(repository, original); },
  };
};

module.exports = { harness, service };
