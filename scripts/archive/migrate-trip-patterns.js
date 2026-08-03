/**
 * ARCHIVED MIGRATION SCRIPT METADATA
 * -----------------------------------
 * Execution Status: UNKNOWN
 * Execution Date: UNKNOWN
 * Affected Environment: UNKNOWN
 * Purpose: Migrate operator route configs to Trip Pattern Architecture v2.
 * Affected Collections: operatorrouteconfigs
 * Rerun Safety: Idempotent: updates indexes and patternName if default pattern is missing.
 * Dry-Run Support: No.
 * Rollback or Recovery Reference: Drop v2 unique index and restore legacy index.
 */

require("dotenv").config();
const mongoose = require("mongoose");

async function run() {
    const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URL;
    if (!MONGO_URI) {
        console.error("❌ MONGO_URI/MONGODB_URL missing.");
        process.exitCode = 1;
        return;
    }

    try {
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected to MongoDB:", MONGO_URI);

        const collection = mongoose.connection.collection("operatorrouteconfigs");

        const legacyIndexes = [
            "brandId_1_variantId_1",
            "operatorId_1_variantId_1",
        ];

        for (const idxName of legacyIndexes) {
            try {
                await collection.dropIndex(idxName);
                console.log(`  ✓ Dropped legacy index: ${idxName}`);
            } catch (err) {
                if (err.code === 27 || err.message.includes("index not found")) {
                    console.log(`  ℹ Index ${idxName} already dropped or never existed.`);
                } else {
                    console.warn(`  ⚠ Could not drop ${idxName}: ${err.message}`);
                }
            }
        }

        const resPattern = await collection.updateMany(
            { patternName: { $exists: false } },
            { $set: { patternName: "Standard" } }
        );
        console.log(`  ✓ Set patternName='Standard' on ${resPattern.modifiedCount} document(s).`);

        const resDefault = await collection.updateMany(
            { isDefault: { $exists: false } },
            { $set: { isDefault: true } }
        );
        console.log(`  ✓ Set isDefault=true on ${resDefault.modifiedCount} document(s).`);

        try {
            await collection.createIndex(
                { brandId: 1, variantId: 1, patternName: 1 },
                { unique: true, name: "brandId_1_variantId_1_patternName_1" }
            );
            console.log("  ✓ Created new unique index: { brandId, variantId, patternName }");
        } catch (err) {
            console.warn(`  ⚠ Index creation: ${err.message}`);
        }

        console.log("\n🎉 Trip pattern migration complete.");
    } catch (error) {
        console.error("❌ Migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    }
}

module.exports = { run };

if (require.main === module) {
  run().catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  });
}
