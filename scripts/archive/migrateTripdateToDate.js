/**
 * ARCHIVED MIGRATION SCRIPT METADATA
 * -----------------------------------
 * Execution Status: UNKNOWN
 * Execution Date: UNKNOWN
 * Affected Environment: UNKNOWN
 * Purpose: Convert Trip.tripDate from legacy string format to BSON Date object.
 * Affected Collections: trips
 * Rerun Safety: Idempotent: filters documents by BSON type String; skips already converted Date objects.
 * Dry-Run Support: No.
 * Rollback or Recovery Reference: Convert Trip.tripDate back to YYYY-MM-DD string.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Trip = require("../../models/tripModel.js");

async function migrate() {
    const dbUri = process.env.MONGODB_URL || process.env.MONGO_URI;
    if (!dbUri) {
        console.error("❌ MONGODB_URL not found.");
        process.exitCode = 1;
        return;
    }

    try {
        console.log("Connecting to database...");
        await mongoose.connect(dbUri);
        console.log("Connected.\n");

        const stringTrips = await Trip.find({ tripDate: { $type: 2 } }).lean();
        console.log(`Found ${stringTrips.length} trips with String tripDate.`);

        let migrated = 0;
        let errors = 0;

        for (const trip of stringTrips) {
            try {
                const dateObj = new Date(trip.tripDate);
                if (isNaN(dateObj.getTime())) {
                    errors++;
                    continue;
                }
                await Trip.updateOne({ _id: trip._id }, { $set: { tripDate: dateObj } });
                migrated++;
            } catch (err) {
                errors++;
            }
        }

        console.log(`Migration Complete: ${migrated} converted, ${errors} errors.`);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    }
}

module.exports = { migrate };

if (require.main === module) {
  migrate().catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  });
}
