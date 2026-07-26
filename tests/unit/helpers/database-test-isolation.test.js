'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDatabaseHelper } = require('../../helpers/db');

const harness = () => {
  const state = {
    created: 0,
    connectedUris: [],
    stops: 0,
    closes: 0,
    drops: 0,
    documents: [{ id: 1 }],
    limiterResets: 0,
  };
  const connection = {
    readyState: 0,
    collections: {
      records: {
        deleteMany: async () => { state.documents.length = 0; },
        resetAll: () => { state.limiterResets += 1; },
      },
    },
    dropDatabase: async () => { state.drops += 1; },
    close: async () => {
      state.closes += 1;
      connection.readyState = 0;
    },
  };
  const mongooseInstance = {
    connection,
    connect: async (uri) => {
      state.connectedUris.push(uri);
      await new Promise((resolve) => setImmediate(resolve));
      connection.readyState = 1;
      connection.uri = uri;
      return mongooseInstance;
    },
  };
  const createMongoServer = async () => {
    const id = ++state.created;
    return {
      getUri: () => `mongodb://memory-${id}`,
      stop: async () => { state.stops += 1; },
    };
  };
  return {
    state,
    connection,
    helper: createDatabaseHelper({ mongooseInstance, createMongoServer }),
  };
};

test('database test helper has deterministic process ownership', async (t) => {
  const { helper, state, connection } = harness();

  await t.test('two concurrent connect calls share one attempt', async () => {
    const [first, second] = await Promise.all([helper.connect(), helper.connect()]);
    assert.strictEqual(first, second);
    assert.equal(state.connectedUris.length, 1);
  });

  await t.test('only one memory server is created', () => {
    assert.equal(state.created, 1);
  });

  await t.test('repeated connect reuses the active connection', async () => {
    assert.strictEqual(await helper.connect(), connection);
    assert.equal(state.created, 1);
    assert.deepEqual(state.connectedUris, ['mongodb://memory-1']);
  });

  await t.test('clearAll removes documents', async () => {
    await helper.clearAll();
    assert.deepEqual(state.documents, []);
  });

  await t.test('clearAll does not reset limiter state', async () => {
    await helper.clearAll();
    assert.equal(state.limiterResets, 0);
  });

  await t.test('repeated disconnect calls close and stop once', async () => {
    await Promise.all([
      helper.disconnect(),
      helper.disconnect(),
      helper.disconnect(),
      helper.disconnect(),
    ]);
    assert.equal(state.closes, 1);
    assert.equal(state.stops, 1);
    assert.equal(state.drops, 1);
  });

  await t.test('connect after full disconnect creates a fresh server', async () => {
    await helper.connect();
    assert.equal(state.created, 2);
    assert.equal(connection.uri, 'mongodb://memory-2');
  });

  await t.test('concurrent callers cannot switch the active URI', async () => {
    const connections = await Promise.all([helper.connect(), helper.connect()]);
    assert.ok(connections.every((value) => value === connection));
    assert.equal(state.created, 2);
    assert.deepEqual(state.connectedUris, [
      'mongodb://memory-1',
      'mongodb://memory-2',
    ]);
    await Promise.all([helper.disconnect(), helper.disconnect(), helper.disconnect()]);
  });
});
