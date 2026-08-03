/**
 * ARCHIVED MIGRATION SCRIPT METADATA
 * -----------------------------------
 * Execution Status: UNKNOWN
 * Execution Date: UNKNOWN
 * Affected Environment: UNKNOWN
 * Purpose: Migrate legacy corridor configurations into the platform corridor registry.
 * Affected Collections: corridors, operatorrouteconfigs
 * Rerun Safety: Idempotent: delegates to corridor-registry-migration.service.js.
 * Dry-Run Support: Yes, via --dry-run.
 * Rollback or Recovery Reference: Rollback via corridor registry migration rollback options.
 */

"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const {
  runCorridorRegistryMigration,
} = require("../../src/modules/admin/platform-registry/corridor-registry-migration.service.js");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const databaseUrl = process.env.MONGODB_URL || process.env.MONGO_URI;

  if (!databaseUrl) {
    console.error("❌ MONGODB_URL environment variable is missing.");
    process.exitCode = 1;
    return;
  }

  try {
    await mongoose.connect(databaseUrl);
    console.log("Connected to MongoDB for Corridor Registry Migration.");

    const result = await runCorridorRegistryMigration({ dryRun });
    console.log("Corridor Registry Migration Summary:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Corridor migration failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

module.exports = { main };

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exitCode = 1;
  });
}
