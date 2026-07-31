require('dotenv').config();
const mongoose = require('mongoose');
const Stop = require('../models/stopModel');

async function migrateStops() {
  const isDryRun = process.argv.includes('--dry-run') || process.env.DRY_RUN === 'true';

  console.log("Starting Stop Registry Migration...");
  if (isDryRun) {
    console.log("== DRY RUN MODE ==");
  }

  try {
    if (!process.env.DB_URL) {
      throw new Error("DB_URL is not defined in the environment.");
    }
    await mongoose.connect(process.env.DB_URL);
    console.log("Connected to MongoDB.");

    let scanned = 0;
    let updated = 0;
    let conflicts = 0;
    let unchanged = 0;

    // 1. Drop old index if exists
    if (!isDryRun) {
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
    } else {
      console.log("[DRY RUN] Would attempt to drop old index '_nameLower_1'");
    }

    const stops = await Stop.find({});
    console.log(`Found ${stops.length} stops to scan.`);

    for (const stop of stops) {
      scanned++;
      let modified = false;

      // Capability defaults
      if (stop.isSearchable === undefined) stop.isSearchable = true;
      if (stop.isRouteStop === undefined) stop.isRouteStop = true;
      
      // parentStopId
      if (stop.parentStopId === undefined) stop.parentStopId = null;

      // Always save to generate _normalizedIdentity
      modified = true;

      if (modified) {
        if (!isDryRun) {
          try {
            await stop.save();
            updated++;
          } catch (err) {
            if (err.code === 11000) {
              console.warn(`[CONFLICT] Stop ID ${stop._id} ("${stop.name}") conflicts with an existing stop under the same geographic context.`);
              conflicts++;
            } else {
              console.error(`Error updating stop ${stop._id}:`, err);
            }
          }
        } else {
          updated++;
        }
      } else {
        unchanged++;
      }
    }

    // 2. Ensure new indexes (Mongoose syncIndexes)
    if (!isDryRun) {
      console.log("Syncing indexes (this creates the new compound unique index)...");
      await Stop.syncIndexes();
      console.log("Indexes synced successfully.");
    } else {
      console.log("[DRY RUN] Would sync indexes to create new compound unique index.");
    }

    console.log(`\nMigration completed.`);
    console.log(`Scanned:   ${scanned}`);
    console.log(`Updated:   ${updated}`);
    console.log(`Unchanged: ${unchanged}`);
    console.log(`Conflicts: ${conflicts}`);

    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrateStops();
