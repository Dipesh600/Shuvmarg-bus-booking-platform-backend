"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const ensureNotificationOutboxIndexes = require("../../../scripts/ensureNotificationOutboxIndexes");

function createMongooseDouble(existingIndexes, indexesError = null) {
  const createCalls = [];
  const collection = {
    indexes: async () => {
      if (indexesError) throw indexesError;
      return existingIndexes;
    },
    createIndex: async (key, options) => {
      createCalls.push({ key, options });
      return options.name;
    },
  };

  return {
    mongooseDouble: {
      connection: {
        collection: name => {
          assert.equal(name, "notificationoutboxes");
          return collection;
        },
      },
    },
    createCalls,
  };
}

test("notification outbox index migration accepts equivalent indexes with default names", async () => {
  const { mongooseDouble, createCalls } = createMongooseDouble([
    { name: "_id_", key: { _id: 1 } },
    { name: "idempotencyKey_1", key: { idempotencyKey: 1 }, unique: true },
    { name: "status_1_nextAttemptAt_1_leaseExpiresAt_1", key: { status: 1, nextAttemptAt: 1, leaseExpiresAt: 1 } },
    { name: "businessReference_1_createdAt_-1", key: { businessReference: 1, createdAt: -1 } },
    { name: "userId_1", key: { userId: 1 } },
    { name: "ownerId_1", key: { ownerId: 1 } },
    { name: "brandId_1", key: { brandId: 1 } },
  ]);

  assert.deepEqual(await ensureNotificationOutboxIndexes(mongooseDouble), { success: true });
  assert.deepEqual(createCalls, []);
});

test("notification outbox index migration creates only missing indexes", async () => {
  const { mongooseDouble, createCalls } = createMongooseDouble([
    { name: "_id_", key: { _id: 1 } },
    { name: "idempotencyKey_1", key: { idempotencyKey: 1 }, unique: true },
    { name: "userId_1", key: { userId: 1 } },
  ]);

  await ensureNotificationOutboxIndexes(mongooseDouble);

  assert.deepEqual(createCalls, [
    {
      key: { status: 1, nextAttemptAt: 1, leaseExpiresAt: 1 },
      options: { name: "sms_due_jobs" },
    },
    {
      key: { businessReference: 1, createdAt: -1 },
      options: { name: "sms_business_history" },
    },
    { key: { ownerId: 1 }, options: { name: "sms_owner" } },
    { key: { brandId: 1 }, options: { name: "sms_brand" } },
  ]);
});

test("notification outbox index migration rejects a non-unique idempotency index", async () => {
  const { mongooseDouble, createCalls } = createMongooseDouble([
    { name: "idempotencyKey_1", key: { idempotencyKey: 1 } },
  ]);

  await assert.rejects(
    ensureNotificationOutboxIndexes(mongooseDouble),
    /idempotencyKey.*must be unique/
  );
  assert.deepEqual(createCalls, []);
});

test("notification outbox index migration rejects a partial idempotency index", async () => {
  const { mongooseDouble, createCalls } = createMongooseDouble([
    {
      name: "idempotencyKey_1",
      key: { idempotencyKey: 1 },
      unique: true,
      partialFilterExpression: { idempotencyKey: { $exists: true } },
    },
  ]);

  await assert.rejects(
    ensureNotificationOutboxIndexes(mongooseDouble),
    /idempotencyKey.*must cover the complete collection/
  );
  assert.deepEqual(createCalls, []);
});

test("notification outbox index migration creates indexes for a new collection", async () => {
  const namespaceMissing = Object.assign(new Error("namespace does not exist"), { code: 26 });
  const { mongooseDouble, createCalls } = createMongooseDouble([], namespaceMissing);

  await ensureNotificationOutboxIndexes(mongooseDouble);

  assert.equal(createCalls.length, 6);
  assert.deepEqual(createCalls[0], {
    key: { idempotencyKey: 1 },
    options: { unique: true, name: "uniq_sms_idempotency" },
  });
});

test("notification outbox index migration treats compound key order as significant", async () => {
  const { mongooseDouble, createCalls } = createMongooseDouble([
    { name: "idempotencyKey_1", key: { idempotencyKey: 1 }, unique: true },
    { name: "wrong_order", key: { nextAttemptAt: 1, status: 1, leaseExpiresAt: 1 } },
  ]);

  await ensureNotificationOutboxIndexes(mongooseDouble);

  assert.deepEqual(createCalls[0], {
    key: { status: 1, nextAttemptAt: 1, leaseExpiresAt: 1 },
    options: { name: "sms_due_jobs" },
  });
});
