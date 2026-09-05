'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const repository = require('../../../../src/modules/agent/admin/conversion/agent-conversion.repository');
const service = require('../../../../src/modules/agent/admin/conversion/agent-conversion.service');

const patch = (methods) => {
  methods = { withTransaction: async work => work(null), ...methods };
  const originals = {};
  for (const [name, fn] of Object.entries(methods)) {
    originals[name] = repository[name];
    repository[name] = fn;
  }
  return () => Object.assign(repository, originals);
};

test('agent conversion service preserves operation order', async (t) => {
  await t.test('successful conversion updates User before Agent lookup', async () => {
    const order = [];
    const user = { _id: 'u1', roles: ['passenger'], role: 'passenger' };
    const restore = patch({
      isValidObjectId: () => true,
      findUserById: async () => { order.push('findUser'); return user; },
      addAgentRoleToUser: async () => { order.push('updateUser'); return user; },
      findAgentByUserId: async () => { order.push('findAgent'); return { _id: 'a1', agentId: 'AG1' }; },
      createAgentForUser: async () => { order.push('createAgent'); },
    });
    try {
      const result = await service.makeUserAgent({ id: 'u1' });
      assert.equal(result.statusCode, 200);
      assert.deepEqual(order, ['findUser', 'updateUser', 'findAgent']);
    } finally {
      restore();
    }
  });

  await t.test('missing Agent is created after lookup', async () => {
    const order = [];
    const user = { _id: 'u1', roles: [], role: 'passenger' };
    const restore = patch({
      isValidObjectId: () => true,
      findUserById: async () => { order.push('findUser'); return user; },
      addAgentRoleToUser: async () => { order.push('updateUser'); return user; },
      findAgentByUserId: async () => { order.push('findAgent'); return null; },
      createAgentForUser: async () => { order.push('createAgent'); return { _id: 'a1', agentId: 'AG1' }; },
    });
    try {
      const result = await service.makeUserAgent({ id: 'u1' });
      assert.equal(result.statusCode, 200);
      assert.deepEqual(order, ['findUser', 'updateUser', 'findAgent', 'createAgent']);
    } finally {
      restore();
    }
  });

  await t.test('invalid states stop later repository operations', async () => {
    const order = [];
    const restore = patch({
      isValidObjectId: () => false,
      findUserById: async () => { order.push('findUser'); },
      addAgentRoleToUser: async () => { order.push('updateUser'); return user; },
      findAgentByUserId: async () => { order.push('findAgent'); },
    });
    try {
      const result = await service.makeUserAgent({ id: 'bad' });
      assert.equal(result.statusCode, 400);
      assert.deepEqual(order, []);
    } finally {
      restore();
    }
  });
});
