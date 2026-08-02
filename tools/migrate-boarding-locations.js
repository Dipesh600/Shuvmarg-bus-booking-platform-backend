"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const {
  runBoardingLocationMigration,
} = require(
  "../src/modules/admin/platform-registry/boarding-location-migration/boarding-location-migration.service.js"
);

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const dbUrl = process.env.MONGODB_URL || process.env.DB_URL;
  if (!dbUrl) throw new Error("MONGODB_URL or DB_URL is required.");
  await mongoose.connect(dbUrl);
  const result = await runBoardingLocationMigration({ dryRun });
  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("Boarding location migration failed:", error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
