require('dotenv').config();
const mongoose = require('mongoose');
const { runStopRegistryMigration } = require('../src/modules/admin/platform-registry/stop-registry-migration.service');

async function migrateStops() {
  const isDryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';

  console.log("Starting Stop Registry Migration (4-Phase Idempotent)...");
  if (isDryRun) {
    console.log("== DRY RUN MODE ==");
  }

  try {
    const dbUrl = process.env.MONGODB_URL || process.env.DB_URL;
    if (!dbUrl) {
      throw new Error("MONGODB_URL or DB_URL is not defined in the environment.");
    }
    await mongoose.connect(dbUrl);
    console.log("Connected to MongoDB.");

    const { success, abortReason, report } = await runStopRegistryMigration({ dryRun: isDryRun });

    console.log("\n--- Phase 1: Scan & Detect Conflicts ---");
    console.log(`Scanned stops: ${report.scanned}`);
    
    if (report.invalid > 0) {
      console.error(`\nFound ${report.invalid} validation issues:`);
      report.invalidRecords.forEach(r => {
        console.error(`- [${r.errorCode}] Stop ${r.stopId} (${r.name}): ${r.message}`);
      });
    }

    if (!success) {
      console.error(`\nMigration Aborted: ${abortReason}`);
      process.exit(1);
    }
    console.log("No identity conflicts found. Safe to proceed.");

    console.log(`\n--- Phase 2: Backfill Data ---`);
    console.log(`Stops needing updates: ${report.wouldUpdate}`);
    if (isDryRun) {
      console.log(`[DRY RUN] Would update ${report.wouldUpdate} stops.`);
    } else {
      console.log(`Backfill complete. Modified: ${report.backfillResult.modified}`);
    }

    console.log(`\n--- Phase 3: Index Swap ---`);
    if (isDryRun) {
      console.log(`[DRY RUN] Would attempt to drop old index '_nameLower_1' if it exists. (Found ${report.indexesToRemove})`);
      console.log(`[DRY RUN] Would attempt to create ${report.indexesToCreate} indexes.`);
    } else {
      console.log(`Indexes removed: ${report.indexResult.indexesRemoved}`);
      console.log(`Indexes created: ${report.indexResult.indexesCreated}`);
      console.log(`Indexes already correct: ${report.indexResult.indexesAlreadyCorrect}`);
    }

    console.log(`\n--- Phase 4: Verify ---`);
    if (isDryRun) {
      console.log("[DRY RUN] Verification skipped.");
    } else {
      if (report.verification.passed) {
        console.log("[VERIFICATION SUCCESS] All stops verified.");
      } else {
        console.error(`[VERIFICATION FAILED] Found issues:`);
        report.verification.errors.forEach(e => console.error("- " + e));
      }
    }

    console.log(`\nMigration completed successfully.`);
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrateStops();
