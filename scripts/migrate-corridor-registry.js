"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const {
  runCorridorRegistryMigration,
} = require("../src/modules/admin/platform-registry/corridor-registry-migration.service.js");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const databaseUrl = process.env.MONGODB_URL || process.env.DB_URL;
  if (!databaseUrl) throw new Error("MONGODB_URL or DB_URL is required.");
  await mongoose.connect(databaseUrl);
  const result = await runCorridorRegistryMigration({ dryRun });
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
  if (!result.success) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error("Corridor migration failed:", error.message);
  await mongoose.disconnect();
  process.exitCode = 1;
});
