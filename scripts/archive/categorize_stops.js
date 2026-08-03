/**
 * ARCHIVED MIGRATION SCRIPT METADATA
 * -----------------------------------
 * Execution Status: UNKNOWN
 * Execution Date: UNKNOWN
 * Affected Environment: UNKNOWN
 * Purpose: Categorize legacy stop records by region and tier.
 * Affected Collections: stops
 * Rerun Safety: Idempotent: updates stop categories based on city matching rules.
 * Dry-Run Support: No.
 * Rollback or Recovery Reference: Unset category field on stop documents.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Stop = require('../../models/stopModel');

async function run() {
    const dbUri = process.env.MONGODB_URL || process.env.MONGO_URI;
    if (!dbUri) {
        console.error("❌ MONGODB_URL not found in environment.");
        process.exitCode = 1;
        return;
    }

    try {
        await mongoose.connect(dbUri);
        console.log('Connected to MongoDB');

        const MAJOR_CITIES = ['Kathmandu', 'Pokhara', 'Chitwan', 'Lumbini', 'Biratnagar', 'Butwal', 'Dharan', 'Nepalgunj'];
        const MAJOR_CORRIDORS = ['Kathmandu - Pokhara', 'Kathmandu - Chitwan', 'Kathmandu - Biratnagar', 'Kathmandu - Butwal'];

        const stops = await Stop.find();
        let updatedCount = 0;

        for (const stop of stops) {
            let isUpdated = false;

            if (MAJOR_CITIES.some(city => stop.name.toLowerCase().includes(city.toLowerCase()))) {
                if (stop.category !== 'MAJOR_CITY') {
                    stop.category = 'MAJOR_CITY';
                    isUpdated = true;
                }
            } else if (MAJOR_CORRIDORS.some(corridor => stop.name.toLowerCase().includes(corridor.toLowerCase()))) {
                if (stop.category !== 'MAJOR_CORRIDOR') {
                    stop.category = 'MAJOR_CORRIDOR';
                    isUpdated = true;
                }
            } else {
                if (stop.category !== 'OTHER') {
                    stop.category = 'OTHER';
                    isUpdated = true;
                }
            }

            if (isUpdated) {
                await stop.save();
                updatedCount++;
            }
        }

        console.log(`Successfully categorized ${updatedCount} stops.`);
    } catch (error) {
        console.error('Error categorizing stops:', error);
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    }
}

module.exports = { run };

if (require.main === module) {
  run().catch(err => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  });
}
