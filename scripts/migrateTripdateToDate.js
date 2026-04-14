/**
 * scripts/migrateTripdateToDate.js
 * 
 * ONE-TIME MIGRATION: Converts tripDate from String to Date type.
 * 
 * The tripModel now stores tripDate as a Date (UTC) instead of a String.
 * Old documents like { tripDate: "2026-04-15" } need to be converted to
 * proper Date objects so range queries and sorting work correctly.
 * 
 * Run ONCE with:
 *   node scripts/migrateTripdateToDate.js
 * 
 * The script is idempotent — safe to re-run, it skips already-migrated docs.
 */

require("dotenv").config({ path: "../.env" });
const mongoose = require("mongoose");

const BATCH_SIZE = 100;

async function migrate() {
    console.log("Connecting to database...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected.\n");

    const Trip = require("../models/tripModel.js");

    let migrated = 0;
    let skipped  = 0;
    let errors   = 0;

    // Find all trips where tripDate is a string (type 2 = String in BSON)
    // We can detect this by checking if the value is a string
    const totalTrips = await Trip.countDocuments({});
    console.log(`Total trips: ${totalTrips}`);

    let processed = 0;
    while (processed < totalTrips) {
        const batch = await Trip.find({}).skip(processed).limit(BATCH_SIZE).lean();
        if (batch.length === 0) break;

        for (const trip of batch) {
            const raw = trip.tripDate;

            // Already a proper Date object (not a string) — skip
            if (raw instanceof Date) {
                skipped++;
                continue;
            }

            // It's a string — convert
            if (typeof raw === "string" && raw.trim() !== "") {
                const parsed = new Date(raw.trim());
                if (isNaN(parsed.getTime())) {
                    console.error(`  ✗ Trip ${trip._id}: Cannot parse tripDate "${raw}" — skipping`);
                    errors++;
                    continue;
                }

                await Trip.updateOne(
                    { _id: trip._id },
                    { $set: { tripDate: parsed } }
                );
                migrated++;
                console.log(`  ✓ Trip ${trip.tripId || trip._id}: "${raw}" → ${parsed.toISOString()}`);
            } else {
                skipped++;
            }
        }

        processed += batch.length;
        console.log(`Progress: ${processed}/${totalTrips} processed`);
    }

    console.log("\n=== Migration Complete ===");
    console.log(`  Migrated : ${migrated}`);
    console.log(`  Skipped  : ${skipped} (already Date or blank)`);
    console.log(`  Errors   : ${errors}`);

    await mongoose.disconnect();
    console.log("Disconnected.");
}

migrate().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
