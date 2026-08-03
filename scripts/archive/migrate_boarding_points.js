/**
 * ARCHIVED MIGRATION SCRIPT METADATA
 * -----------------------------------
 * Execution Status: UNKNOWN
 * Execution Date: UNKNOWN
 * Affected Environment: UNKNOWN
 * Purpose: Migrate legacy BoardingPoints records into the StopPoint model.
 * Affected Collections: boardingpoints, stopPoints
 * Rerun Safety: Idempotent: skips existing StopPoint records.
 * Dry-Run Support: No.
 * Rollback or Recovery Reference: Delete migrated StopPoint records.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Stop = require("../../models/stopModel.js");
const StopPoint = require("../../models/stopPointModel.js");

async function migrate() {
    const dbUri = process.env.MONGODB_URL || process.env.MONGO_URI;
    if (!dbUri) {
        console.error("❌ MONGODB_URL not found.");
        process.exitCode = 1;
        return;
    }

    try {
        await mongoose.connect(dbUri);
        console.log("Connected to MongoDB.");

        const BoardingPoint = mongoose.connection.collection("boardingpoints");
        const legacyPoints = await BoardingPoint.find({}).toArray();

        console.log(`Found ${legacyPoints.length} legacy boarding points.`);

        let migratedCount = 0;
        let skippedCount = 0;

        for (const pt of legacyPoints) {
            const cityName = (pt.city || pt.cityName || "").trim();
            if (!cityName) {
                skippedCount++;
                continue;
            }

            const stopDoc = await Stop.findOne({ name: new RegExp(`^${cityName}$`, "i") });
            if (!stopDoc) {
                skippedCount++;
                continue;
            }

            const pointName = (pt.pointName || pt.name || "").trim();
            if (!pointName) {
                skippedCount++;
                continue;
            }

            const existing = await StopPoint.findOne({
                stopId: stopDoc._id,
                name: pointName,
            });

            if (existing) {
                skippedCount++;
                continue;
            }

            await StopPoint.create({
                stopId: stopDoc._id,
                name: pointName,
                coordinates: pt.coordinates || null,
                supportsBoarding: pt.type !== "DROPPING",
                supportsDropping: pt.type !== "BOARDING",
                source: "MANUAL",
            });

            migratedCount++;
        }

        console.log(`Boarding Points Migration Finished: ${migratedCount} created, ${skippedCount} skipped.`);
    } catch (err) {
        console.error("Migration error:", err);
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
