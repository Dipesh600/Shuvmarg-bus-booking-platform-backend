"use strict";

const mongoose = require("mongoose");

async function ensureNotificationOutboxIndexes(mongooseInstance = mongoose) {
  const collection = mongooseInstance.connection.collection("notificationoutboxes");
  await collection.createIndex({ idempotencyKey: 1 }, { unique: true, name: "uniq_sms_idempotency" });
  await collection.createIndex({ status: 1, nextAttemptAt: 1, leaseExpiresAt: 1 }, { name: "sms_due_jobs" });
  await collection.createIndex({ businessReference: 1, createdAt: -1 }, { name: "sms_business_history" });
  await collection.createIndex({ userId: 1 }, { name: "sms_user" });
  await collection.createIndex({ ownerId: 1 }, { name: "sms_owner" });
  await collection.createIndex({ brandId: 1 }, { name: "sms_brand" });
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
