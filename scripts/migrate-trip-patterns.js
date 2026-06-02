/**
 * MIGRATION: Trip Pattern Architecture (v2)
 *
 * What this does:
 *   1. Drops the old restrictive unique index { brandId, variantId }
 *   2. Sets patternName: "Standard" and isDefault: true on ALL existing records
 *   3. Creates the new unique index { brandId, variantId, patternName }
 *
 * Run ONCE before deploying the new server code:
 *   node scripts/migrate-trip-patterns.js
 */

require("dotenv").config();
const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/shuvmarg";

async function run() {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB:", MONGO_URI);

    const collection = mongoose.connection.collection("operatorrouteconfigs");

    // ── Step 1: Drop ALL legacy restrictive indexes ───────────────────────────
    const legacyIndexes = [
        "brandId_1_variantId_1",       // old constraint (one config per brand/variant)
        "operatorId_1_variantId_1",    // very old constraint from before brandId was used
        "operatorId_1_status_1",       // old operatorId compound index
    ];
    for (const idxName of legacyIndexes) {
        try {
            await collection.dropIndex(idxName);
            console.log(`✅ Dropped legacy index: ${idxName}`);
        } catch (err) {
            if (err.codeName === "IndexNotFound") {
                console.log(`ℹ️  Already gone or never existed: ${idxName}`);
            } else {
                throw err;
            }
        }
    }

    // ── Step 2: Backfill patternName and isDefault on existing records ────────
    const result = await collection.updateMany(
        { patternName: { $exists: false } },
        { $set: { patternName: "Standard", isDefault: true } }
    );
    console.log(`✅ Backfilled ${result.modifiedCount} existing records with patternName="Standard" isDefault=true`);

    // ── Step 3: Create new unique index { brandId, variantId, patternName } ──
    await collection.createIndex(
        { brandId: 1, variantId: 1, patternName: 1 },
        { unique: true, name: "brandId_1_variantId_1_patternName_1" }
    );
    console.log("✅ Created new unique index { brandId, variantId, patternName }");

    console.log("\n🎉 Migration complete. You can now restart the server with the new code.");
    await mongoose.disconnect();
}

run().catch(err => {
    console.error("❌ Migration failed:", err);
    process.exit(1);
});
