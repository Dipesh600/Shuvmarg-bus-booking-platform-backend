/**
 * ARCHIVED MIGRATION SCRIPT METADATA
 * -----------------------------------
 * Execution Status: UNKNOWN
 * Execution Date: UNKNOWN
 * Affected Environment: UNKNOWN
 * Purpose: Merge duplicate stop records and update references in route configs.
 * Affected Collections: stops, operatorrouteconfigs
 * Rerun Safety: Idempotent: merges duplicate stops based on normalized city names.
 * Dry-Run Support: No.
 * Rollback or Recovery Reference: Restore from database backup.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Stop = require('../../models/stopModel');
const OperatorRouteConfig = require('../../models/operatorRouteConfigModel');

async function fixDuplicates() {
    const dbUri = process.env.MONGODB_URL || process.env.MONGO_URI;
    if (!dbUri) {
        console.error("❌ MONGODB_URL not found in environment.");
        process.exitCode = 1;
        return;
    }

    try {
        await mongoose.connect(dbUri);
        console.log('Connected to MongoDB');

        const stops = await Stop.find();
        const cityMap = {};

        for (const stop of stops) {
            const normalizedName = stop.name.trim().toLowerCase();
            if (!cityMap[normalizedName]) {
                cityMap[normalizedName] = [];
            }
            cityMap[normalizedName].push(stop);
        }

        for (const [cityName, duplicateStops] of Object.entries(cityMap)) {
            if (duplicateStops.length > 1) {
                console.log(`Found ${duplicateStops.length} duplicates for "${cityName}"`);

                const primaryStop = duplicateStops[0];
                const duplicateStopIds = duplicateStops.slice(1).map(s => s._id);

                for (const dupId of duplicateStopIds) {
                    await OperatorRouteConfig.updateMany(
                        { 'timingConfig.stopId': dupId },
                        { $set: { 'timingConfig.$.stopId': primaryStop._id } }
                    );

                    await OperatorRouteConfig.updateMany(
                        { 'returnTimingConfig.stopId': dupId },
                        { $set: { 'returnTimingConfig.$.stopId': primaryStop._id } }
                    );

                    await Stop.findByIdAndDelete(dupId);
                    console.log(`  Merged duplicate stop ${dupId} into primary ${primaryStop._id}`);
                }
            }
        }

        console.log('Duplicate stop resolution complete.');
    } catch (error) {
        console.error('Error fixing duplicates:', error);
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    }
}

module.exports = { fixDuplicates };

if (require.main === module) {
  fixDuplicates().catch(err => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  });
}
