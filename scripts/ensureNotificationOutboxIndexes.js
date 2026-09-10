"use strict";

const mongoose = require("mongoose");

const REQUIRED_INDEXES = [
  { key: { idempotencyKey: 1 }, options: { unique: true, name: "uniq_sms_idempotency" } },
  { key: { status: 1, nextAttemptAt: 1, leaseExpiresAt: 1 }, options: { name: "sms_due_jobs" } },
  { key: { businessReference: 1, createdAt: -1 }, options: { name: "sms_business_history" } },
  { key: { userId: 1 }, options: { name: "sms_user" } },
  { key: { ownerId: 1 }, options: { name: "sms_owner" } },
  { key: { brandId: 1 }, options: { name: "sms_brand" } },
];

function hasSameKey(existingKey, requiredKey) {
  const existingEntries = Object.entries(existingKey || {});
  const requiredEntries = Object.entries(requiredKey);
  return existingEntries.length === requiredEntries.length
    && existingEntries.every(([field, direction], position) => {
      const [requiredField, requiredDirection] = requiredEntries[position] || [];
      return field === requiredField && direction === requiredDirection;
    });
}

function assertCompatibleOptions(existingIndex, requiredIndex) {
  const existingUnique = existingIndex.unique === true;
  const requiredUnique = requiredIndex.options.unique === true;
  if (existingUnique !== requiredUnique) {
    const requirement = requiredUnique ? "must be unique" : "must not be unique";
    throw new Error(
      `Existing index "${existingIndex.name || "unnamed"}" for ${JSON.stringify(requiredIndex.key)} ${requirement}.`
    );
  }

  if (existingIndex.sparse === true || existingIndex.partialFilterExpression) {
    throw new Error(
      `Existing index "${existingIndex.name || "unnamed"}" for ${JSON.stringify(requiredIndex.key)} must cover the complete collection.`
    );
  }
}

async function listExistingIndexes(collection) {
  try {
    return await collection.indexes();
  } catch (error) {
    if (error?.code === 26 || error?.codeName === "NamespaceNotFound") return [];
    throw error;
  }
}

async function ensureNotificationOutboxIndexes(mongooseInstance = mongoose) {
  const collection = mongooseInstance.connection.collection("notificationoutboxes");
  const existingIndexes = await listExistingIndexes(collection);

  for (const requiredIndex of REQUIRED_INDEXES) {
    const equivalentIndex = existingIndexes.find(existingIndex => (
      hasSameKey(existingIndex.key, requiredIndex.key)
    ));

    if (equivalentIndex) {
      assertCompatibleOptions(equivalentIndex, requiredIndex);
      continue;
    }

    await collection.createIndex(requiredIndex.key, requiredIndex.options);
  }

  return { success: true };
}

if (require.main === module) {
  require("dotenv").config();
  if (!process.env.MONGODB_URL?.trim()) {
    console.error("[db:index:notification-outbox] MONGODB_URL is required.");
    process.exitCode = 1;
  } else {
    mongoose.connect(process.env.MONGODB_URL)
      .then(ensureNotificationOutboxIndexes)
      .then(() => console.log("[db:index:notification-outbox] Indexes ensured successfully."))
      .catch(error => { console.error("[db:index:notification-outbox] Index creation failed:", error.message);
        process.exitCode = 1; })
      .finally(() => mongoose.disconnect());
  }
}

module.exports = ensureNotificationOutboxIndexes;
