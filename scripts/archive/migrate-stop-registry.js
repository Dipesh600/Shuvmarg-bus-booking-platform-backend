/**
 * ARCHIVED MIGRATION SCRIPT METADATA
 * -----------------------------------
 * Execution Status: UNKNOWN
 * Execution Date: UNKNOWN
 * Affected Environment: UNKNOWN
 * Purpose: Migrate legacy city/stop data into the unified stop registry.
 * Affected Collections: stops, stopPoints
 * Rerun Safety: Idempotent: delegates to stop-registry-migration.service.
 * Dry-Run Support: Yes, via --dry-run.
 * Rollback or Recovery Reference: Rollback via stop registry migration service.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { runStopRegistryMigration } = require('../../src/modules/admin/platform-registry/stop-registry-migration.service');

async function migrateStops() {
  const isDryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';
  const mongoUri = process.env.MONGODB_URL || process.env.MONGO_URI;

  if (!mongoUri) {
    console.error("❌ MONGODB_URL is missing.");
    process.exitCode = 1;
    return;
  }

  console.log("Starting Stop Registry Migration...");
  if (isDryRun) {
    console.log("MODE: DRY RUN (No changes will be saved)");
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("Connected to database.");

    const results = await runStopRegistryMigration({ isDryRun });
    console.log("Migration finished successfully.");
    console.log("Summary:", JSON.stringify(results, null, 2));

  } catch (error) {
    console.error("Migration failed:", error);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log("Disconnected from database.");
    }
  }
}

module.exports = { migrateStops };

if (require.main === module) {
  migrateStops().catch(err => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  });
}
