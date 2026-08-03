'use strict';

const mongoose = require('mongoose');

async function ensureEsewaPaymentAttemptIndexes(
  mongooseInstance = mongoose
) {
  const collection = mongooseInstance.connection.collection(
    'esewapaymentattempts'
  );
  await collection.createIndex(
    { tempBookingId: 1 },
    { unique: true }
  );
  await collection.createIndex(
    { transactionUuid: 1 },
    { unique: true }
  );
  await collection.createIndex({ userId: 1, createdAt: -1 });
  await collection.createIndex({ status: 1, processingExpiresAt: 1 });
  return { success: true };
}

if (require.main === module) {
  require('dotenv').config();
  const mongoUrl = process.env.MONGODB_URL;
  if (!mongoUrl?.trim()) {
    console.error(
      '[db:index:esewa-payment-attempt] MONGODB_URL is required.'
    );
    process.exitCode = 1;
    return;
  }
  mongoose
    .connect(mongoUrl)
    .then(async () => {
      await ensureEsewaPaymentAttemptIndexes();
      console.log(
        '[db:index:esewa-payment-attempt] Indexes ensured successfully.'
      );
    })
    .catch((error) => {
      console.error(
        '[db:index:esewa-payment-attempt] Index creation failed:',
        error.message
      );
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = ensureEsewaPaymentAttemptIndexes;
