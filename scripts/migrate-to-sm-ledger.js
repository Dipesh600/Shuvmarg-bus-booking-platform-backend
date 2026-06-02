#!/usr/bin/env node

/**
 * migrate-to-sm-ledger.js
 *
 * One-time migration script: seeds existing Wallet.balance values into
 * the new sm_ledger as ADMIN_CREDIT entries.
 *
 * USAGE:
 *   # Dry run (no writes — reports what WOULD happen):
 *   node scripts/migrate-to-sm-ledger.js --dry-run
 *
 *   # Execute (writes to sm_ledger, sets legacyBalance):
 *   node scripts/migrate-to-sm-ledger.js --execute
 *
 * WHAT IT DOES:
 *   1. Finds all wallets with balance > 0
 *   2. For each wallet:
 *      a. Creates an ADMIN_CREDIT entry in sm_ledger with 12-month expiry
 *      b. Sets Wallet.legacyBalance = current balance (preservation)
 *   3. Verifies: computeSpendableBalance(userId) === Wallet.balance
 *   4. Reports results
 *
 * SAFETY:
 *   - Idempotent: checks if migration already ran (legacyBalance != null)
 *   - Skips wallets that already have legacyBalance set
 *   - No balance field is modified — only legacyBalance is set
 *   - Each wallet is migrated in its own session (one failure doesn't block others)
 */

const mongoose = require("mongoose");
const path = require("path");

// Load env config
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const Wallet = require("../models/walletModel");
const SMLedger = require("../models/smLedgerModel");
const { computeSpendableBalance } = require("../services/smLedgerService");

// ─── CLI Argument Parsing ────────────────────────────────────────────────────
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
  process.exit(0);
}

// ─── Main Migration ──────────────────────────────────────────────────────────
async function main() {
  const dbUri = process.env.DB_URI || process.env.MONGODB_URI || process.env.MONGODB_URL;
  if (!dbUri) {
    console.error("❌ No DB_URI, MONGODB_URI, or MONGODB_URL found in environment.");
    process.exit(1);
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  SM LEDGER MIGRATION — ${isDryRun ? "DRY RUN" : "🚀 EXECUTING"}`);
  console.log(`${"═".repeat(60)}\n`);

  await mongoose.connect(dbUri);
  console.log("✅ Connected to MongoDB\n");

  // Find all wallets with positive balance that haven't been migrated yet
  const walletsToMigrate = await Wallet.find({
    balance: { $gt: 0 },
    legacyBalance: null, // Not yet migrated
  }).lean();

  // Also check already-migrated count
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
    process.exit(0);
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

      // Create the migration ledger entry
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

      // Set legacyBalance (marks this wallet as migrated)
      await Wallet.updateOne(
        { _id: wallet._id },
        { $set: { legacyBalance: balance } }
      );

      // Verify
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

  // ─── Report ──────────────────────────────────────────────────────────────
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
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
