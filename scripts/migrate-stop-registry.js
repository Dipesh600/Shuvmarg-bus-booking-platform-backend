require('dotenv').config();
const mongoose = require('mongoose');
const Stop = require('../models/stopModel');
const { buildStopIdentity } = require('../src/modules/admin/platform-registry/stop-identity');

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

    // PHASE 1: Scan & Detect Conflicts
    console.log("\n--- Phase 1: Scan & Detect Conflicts ---");
    const stops = await Stop.find({}).lean();
    console.log(`Found ${stops.length} stops to scan.`);

    const identityMap = new Map();
    let scanConflicts = 0;
    const toUpdate = [];

    for (const stop of stops) {
      const identity = buildStopIdentity({
        name: stop.name,
        district: stop.district,
        municipality: stop.municipality,
        parentStopId: stop.parentStopId
      });

      if (identityMap.has(identity)) {
        console.warn(`[CONFLICT] Stops ${stop._id} and ${identityMap.get(identity)} share the same identity: "${identity}"`);
        scanConflicts++;
      } else {
        identityMap.set(identity, stop._id);
        
        let modified = false;
        const updates = {};
        
        if (stop._normalizedIdentity !== identity) {
          updates._normalizedIdentity = identity;
          modified = true;
        }
        if (stop.isSearchable === undefined) {
          updates.isSearchable = true;
          modified = true;
        }
        if (stop.isRouteStop === undefined) {
          updates.isRouteStop = true;
          modified = true;
        }
        if (stop.parentStopId === undefined) {
          updates.parentStopId = null;
          modified = true;
        }
        
        if (modified) {
          toUpdate.push({ id: stop._id, updates });
        }
      }
    }

    if (scanConflicts > 0) {
      console.error(`\nMigration Aborted: Found ${scanConflicts} identity conflicts. Resolve them manually before running the migration.`);
      process.exit(1);
    }
    console.log("No identity conflicts found. Safe to proceed.");

    // PHASE 2: Backfill Data
    console.log(`\n--- Phase 2: Backfill Data ---`);
    console.log(`Stops needing updates: ${toUpdate.length}`);
    
    if (toUpdate.length > 0) {
      if (isDryRun) {
        console.log(`[DRY RUN] Would update ${toUpdate.length} stops.`);
      } else {
        console.log(`Updating ${toUpdate.length} stops...`);
        const bulkOps = toUpdate.map(doc => ({
          updateOne: {
            filter: { _id: doc.id },
            update: { $set: doc.updates }
          }
        }));
        
        const result = await Stop.collection.bulkWrite(bulkOps);
        console.log(`Backfill complete. Modified: ${result.modifiedCount}`);
      }
    } else {
      console.log("All stops are up to date.");
    }

    // PHASE 3: Index Swap
    console.log(`\n--- Phase 3: Index Swap ---`);
    if (isDryRun) {
      console.log("[DRY RUN] Would attempt to drop old index '_nameLower_1' if it exists.");
      console.log("[DRY RUN] Would sync indexes to create new unique index on '_normalizedIdentity'.");
    } else {
      try {
        await Stop.collection.dropIndex("_nameLower_1");
        console.log("Dropped old unique index on _nameLower");
      } catch (err) {
        if (err.code === 27) {
          console.log("Old unique index _nameLower_1 not found, skipping drop.");
        } else {
          console.error("Error dropping old index:", err);
        }
      }

      console.log("Syncing indexes (this will create the new compound unique index if missing, and drop obsolete ones)...");
      await Stop.syncIndexes();
      console.log("Indexes synced successfully.");
    }

    // PHASE 4: Verify
    console.log(`\n--- Phase 4: Verify ---`);
    if (isDryRun) {
      console.log("[DRY RUN] Verification skipped.");
    } else {
      const missingIdentity = await Stop.countDocuments({ _normalizedIdentity: { $exists: false } });
      if (missingIdentity > 0) {
        console.error(`[VERIFICATION FAILED] ${missingIdentity} stops are still missing _normalizedIdentity.`);
      } else {
        console.log("[VERIFICATION SUCCESS] All stops have _normalizedIdentity.");
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
