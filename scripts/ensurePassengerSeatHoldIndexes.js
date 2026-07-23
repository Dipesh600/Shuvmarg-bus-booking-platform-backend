'use strict';

/**
 * scripts/ensurePassengerSeatHoldIndexes.js
 *
 * Idempotent migration script that explicitly creates single-field sparse unique
 * indexes on the SeatHold collection.
 */

const mongoose = require("mongoose");
const SeatHold = require("../models/seatHoldModel");

const extractDatabaseName = (urlStr) => {
  try {
    const parsed = new URL(urlStr);
    return parsed.pathname.replace(/^\//, "") || "default";
  } catch (_) {
    return "configured-db";
  }
};

const ensurePassengerSeatHoldIndexes = async (mongooseInstance = mongoose) => {
  const collection = mongooseInstance.connection.collection("seatholds");

  await collection.createIndex(
    { seatKeys: 1 },
    {
      unique: true,
      sparse: true,
      name: "uniq_active_trip_seat_hold",
    }
  );

  await collection.createIndex(
    { userTripKey: 1 },
    {
      unique: true,
      sparse: true,
      name: "uniq_active_user_trip_hold",
    }
  );

  return { success: true };
};

// Standalone CLI execution
if (require.main === module) {
  require("dotenv").config();
  const mongoUrl = process.env.MONGODB_URL;
  if (!mongoUrl || !mongoUrl.trim()) {
    console.error("[db:index:passenger-seat-hold] MONGODB_URL environment variable is required.");
    process.exit(1);
  }

  const dbName = extractDatabaseName(mongoUrl);

  mongoose
    .connect(mongoUrl)
    .then(async () => {
      console.log(`[db:index:passenger-seat-hold] Connected to database "${dbName}". Creating indexes...`);
      await ensurePassengerSeatHoldIndexes();
      console.log("[db:index:passenger-seat-hold] Successfully ensured seat hold single-field sparse unique indexes.");
    })
    .catch((err) => {
      console.error("[db:index:passenger-seat-hold] Index creation failed:", err.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => {});
      if (process.exitCode && process.exitCode !== 0) {
        process.exit(process.exitCode);
      }
    });
}

module.exports = ensurePassengerSeatHoldIndexes;
