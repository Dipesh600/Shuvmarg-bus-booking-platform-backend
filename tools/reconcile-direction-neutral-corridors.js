"use strict";

/**
 * Dry-run by default. Use --apply only after reviewing the merge plan.
 * Apply mode requires MongoDB transaction support and preserves variants/fleets.
 */

async function main() {
  require("dotenv").config();
  const mongoose = require("mongoose");
  const {
    reconcileDuplicateCorridors,
  } = require(
    "../src/modules/admin/platform-registry/corridor-migration/" +
    "corridor-duplicate-reconciliation.service.js"
  );
  const dbUrl = process.env.MONGODB_URL || process.env.DB_URL;
  const apply = process.argv.includes("--apply");
  if (!dbUrl) throw new Error("MONGODB_URL or DB_URL is required.");
  await mongoose.connect(dbUrl);
  try {
    const result = await reconcileDuplicateCorridors({ dryRun: !apply });
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", ...result }, null, 2));
    process.exitCode = result.success &&
      (apply || result.plan.merges.length === 0) ? 0 : 2;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Direction-neutral corridor reconciliation failed:", error.stack || error.message);
    process.exitCode = 1;
  });
}

module.exports = { main };
