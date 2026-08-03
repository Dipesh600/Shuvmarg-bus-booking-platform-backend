/**
 * ARCHIVED MIGRATION SCRIPT METADATA
 * -----------------------------------
 * Execution Status: UNKNOWN
 * Execution Date: UNKNOWN
 * Affected Environment: UNKNOWN
 * Purpose: Seed existing Wallet.balance values into sm_ledger as ADMIN_CREDIT entries.
 * Affected Collections: wallets, sm_ledger
 * Rerun Safety: Idempotent: checks if legacyBalance is already populated; skips processed wallets.
 * Dry-Run Support: Yes, via --dry-run.
 * Rollback or Recovery Reference: Remove ADMIN_CREDIT entries created by migration and reset legacyBalance.
 */

const mongoose = require("mongoose");
const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const Wallet = require("../../models/walletModel");
const SMLedger = require("../../models/smLedgerModel");
const { computeSpendableBalance } = require("../../src/modules/wallet/sm-ledger/sm-ledger-balance.service");

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const isExecute = args.includes("--execute");

  if (!isDryRun && !isExecute) {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║  SM Ledger Migration Script                           ║
║                                                       ║
║  USAGE:                                               ║
║    --dry-run    Preview only, no writes               ║
║    --execute    Run the actual migration               ║
╚═══════════════════════════════════════════════════════╝
    `);
    return;
  }

  const dbUri = process.env.DB_URI || process.env.MONGODB_URI || process.env.MONGODB_URL;
  if (!dbUri) {
    console.error("❌ No DB_URI, MONGODB_URI, or MONGODB_URL found in environment.");
    process.exitCode = 1;
    return;
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  SM LEDGER MIGRATION — ${isDryRun ? "DRY RUN" : "🚀 EXECUTING"}`);
  console.log(`${"═".repeat(60)}\n`);

  await mongoose.connect(dbUri);
  console.log("✅ Connected to MongoDB\n");

  const walletsToMigrate = await Wallet.find({
    balance: { $gt: 0 },
    legacyBalance: null,
  }).lean();

  const alreadyMigrated = await Wallet.countDocuments({
    legacyBalance: { $ne: null },
  });

  console.log(`📊 Stats:`);
  console.log(`   Wallets with positive balance (unmigrated): ${walletsToMigrate.length}`);
  console.log(`   Already migrated: ${alreadyMigrated}`);
  console.log(`   Wallets with zero balance (skipped): ${await Wallet.countDocuments({ balance: 0, legacyBalance: null })}\n`);

  if (walletsToMigrate.length === 0) {
    console.log("✅ Nothing to migrate. All wallets are either migrated or have zero balance.\n");
    await mongoose.disconnect();
    return;
  }

  let successCount = 0;
  let failCount = 0;
  let totalAmountMigrated = 0;
  const failures = [];

  for (const wallet of walletsToMigrate) {
    const userId = wallet.userId;
    const balance = wallet.balance;

    try {
      console.log(`  → User ${userId}: Rs. ${balance}`);

      if (isDryRun) {
        console.log(`    [DRY RUN] Would create ADMIN_CREDIT for Rs. ${balance}`);
        successCount++;
        totalAmountMigrated += balance;
        continue;
      }

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + 12);

      await SMLedger.create({
        userId,
        type: "ADMIN_CREDIT",
        direction: "CREDIT",
        amount: balance,
        status: "ACTIVE",
        expires_at: expiresAt,
        remainingAmount: balance,
        note: `Migration from legacy wallet balance. Original: NPR ${balance}. Migrated at: ${new Date().toISOString()}`,
      });

      await Wallet.updateOne(
        { _id: wallet._id },
        { $set: { legacyBalance: balance } }
      );

      const computed = await computeSpendableBalance(userId);
      if (Math.abs(computed.display - balance) > 0.01) {
        console.log(`    ⚠️  VERIFICATION MISMATCH: stored=${balance}, computed=${computed.display}`);
        failures.push({ userId, stored: balance, computed: computed.display, error: "Mismatch" });
        failCount++;
      } else {
        console.log(`    ✅ Migrated & verified: Rs. ${balance}`);
        successCount++;
        totalAmountMigrated += balance;
      }
    } catch (error) {
      console.log(`    ❌ FAILED: ${error.message}`);
      failures.push({ userId, balance, error: error.message });
      failCount++;
    }
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  MIGRATION ${isDryRun ? "PREVIEW" : "RESULTS"}`);
  console.log(`${"═".repeat(60)}`);
  console.log(`  ✅ Successful: ${successCount}`);
  console.log(`  ❌ Failed:     ${failCount}`);
  console.log(`  💰 Total migrated: NPR ${totalAmountMigrated.toFixed(2)}`);

  if (failures.length > 0) {
    console.log(`\n  FAILURES:`);
    failures.forEach((f) => {
      console.log(`    - User ${f.userId}: ${f.error}`);
    });
  }

  console.log(`${"═".repeat(60)}\n`);

  await mongoose.disconnect();
  console.log("✅ Disconnected from MongoDB\n");
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

module.exports = { main };

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exitCode = 1;
  });
}
