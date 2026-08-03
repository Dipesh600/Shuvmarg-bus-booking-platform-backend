/**
 * ARCHIVED MIGRATION SCRIPT METADATA
 * -----------------------------------
 * Execution Status: UNKNOWN
 * Execution Date: UNKNOWN
 * Affected Environment: UNKNOWN
 * Purpose: Manual trigger to generate trips for a date range via tripGeneratorCron service.
 * Affected Collections: schedules, trips
 * Rerun Safety: Idempotent: trip generator checks schedule dates and avoids duplicate trip creation.
 * Dry-Run Support: No.
 * Rollback or Recovery Reference: Delete newly created trips for target date range.
 */

const mongoose = require('mongoose');
require('dotenv').config();
const { generateTripsForDateRange } = require('../../services/tripGeneratorCron');
const Schedule = require('../../models/scheduleModel');

async function backfill() {
    const dbUri = process.env.MONGODB_URL || process.env.MONGO_URI;
    if (!dbUri) {
        console.error("❌ MONGODB_URL not found in environment.");
        process.exitCode = 1;
        return;
    }

    try {
        await mongoose.connect(dbUri);
        console.log('Connected to MongoDB');

        const activeSchedules = await Schedule.find({ status: 'ACTIVE' });
        console.log(`Found ${activeSchedules.length} active schedules.`);

        for (const schedule of activeSchedules) {
            console.log(`Generating trips for schedule: ${schedule._id} (${schedule.departureTime})`);
            await generateTripsForDateRange(schedule, 60);
        }

        console.log('Backfill complete.');

        const Trip = mongoose.model('Trip');
        const count = await Trip.countDocuments({});
        console.log(`Total Trips now in DB: ${count}`);

    } catch (err) {
        console.error('Backfill failed:', err);
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    }
}

module.exports = { backfill };

if (require.main === module) {
  Promise.resolve(backfill()).catch((err) => {
    console.error("Migration execution failed:", err);
    process.exitCode = 1;
  });
}
