'use strict';

/**
 * scripts/ensurePassengerSeatHoldIndexes.js
 *
 * Idempotent migration script that explicitly creates single-field sparse unique
 * indexes on the SeatHold collection.
 */

const mongoose = require("mongoose");
const SeatHold = require("../models/seatHoldModel");

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
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || "mongodb://localhost:27017/shuvmarg";
  mongoose
    .connect(mongoUri)
    .then(async () => {
      console.log("[db:index:passenger-seat-hold] Connected to MongoDB. Creating indexes...");
      await ensurePassengerSeatHoldIndexes();
      console.log("[db:index:passenger-seat-hold] Successfully ensured seat hold single-field sparse unique indexes.");
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error("[db:index:passenger-seat-hold] Index creation failed:", err);
      process.exit(1);
    });
}

module.exports = ensurePassengerSeatHoldIndexes;
