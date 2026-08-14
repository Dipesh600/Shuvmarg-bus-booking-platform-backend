#!/usr/bin/env node
"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const { runDefaultBrandMigration } = require("../src/modules/fleet-management/migrate-default-brands");

function sanitizeMongoUri(uri) {
  try {
    const parsed = new URL(uri);
    if (parsed.password) {
      parsed.password = "****";
    }
    return parsed.toString();
  } catch {
    return uri.replace(/(:\/\/[^:]+:)([^@]+)(@)/, "$1****$3");
  }
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!mongoUri || typeof mongoUri !== "string" || !mongoUri.trim()) {
    console.error("[MIGRATION ERROR] Database URI is required. Set MONGODB_URI or MONGO_URI in your environment.");
    process.exit(1);
  }

  const isConnected = mongoose.connection.readyState === 1;

  if (!isConnected) {
    console.log(`[MIGRATION] Connecting to database: ${sanitizeMongoUri(mongoUri.trim())}`);
    await mongoose.connect(mongoUri.trim());
  }

  try {
    console.log(`[MIGRATION] Running default brand migration (dryRun: ${isDryRun})...`);
    const stats = await runDefaultBrandMigration({ dryRun: isDryRun });
    console.log(JSON.stringify(stats, null, 2));

    if (stats.errors.length > 0) {
      console.warn(`\n[WARNING] ${stats.errors.length} ambiguous/unresolved owner records found.`);
      if (stats.skippedMissingCompanyName > 0 || stats.ambiguousMultipleBrands > 0) {
        process.exit(1);
      }
    }

    console.log("\n[MIGRATION COMPLETE] Success.");
    process.exit(0);
  } catch (error) {
    console.error("[MIGRATION ERROR]", error);
    process.exit(1);
  } finally {
    if (!isConnected) {
      await mongoose.disconnect();
    }
  }
}

if (require.main === module) {
  main();
}
