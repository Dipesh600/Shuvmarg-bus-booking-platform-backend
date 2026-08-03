/**
 * ARCHIVED MIGRATION SCRIPT METADATA
 * -----------------------------------
 * Execution Status: UNKNOWN
 * Execution Date: UNKNOWN
 * Affected Environment: UNKNOWN
 * Purpose: One-time migration for multi-role identity system (populates User.roles[] array).
 * Affected Collections: users
 * Rerun Safety: Idempotent: skips users whose roles array is up to date.
 * Dry-Run Support: Yes, via --dry-run.
 * Rollback or Recovery Reference: Revert User.roles array to single User.role string.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../../models/userModel.js");

async function migrateRoles() {
    const DRY_RUN = process.argv.includes("--dry-run");
    const uri = process.env.MONGODB_URL || process.env.MONGO_URI || process.env.DB_URI;

    if (!uri) {
        console.error("❌ No MONGODB_URL, MONGO_URI, or DB_URI found in environment");
        process.exitCode = 1;
        return;
    }

    try {
        await mongoose.connect(uri);
        console.log(`✅ Connected to MongoDB for Role Migration (${DRY_RUN ? "DRY RUN" : "WRITE"})`);

        const users = await User.find({}).lean();
        console.log(`Found ${users.length} total users to inspect.`);

        let updated = 0;
        let skipped = 0;

        for (const u of users) {
            let roles = Array.isArray(u.roles) && u.roles.length > 0 ? [...u.roles] : [];
            let primaryRole = u.role || "passenger";

            if (primaryRole === "admin") {
                primaryRole = "passenger";
            }
            roles = roles.filter((r) => r !== "admin");

            if (!roles.includes(primaryRole)) {
                roles.push(primaryRole);
            }

            const needsUpdate =
                u.role !== primaryRole ||
                JSON.stringify(u.roles || []) !== JSON.stringify(roles) ||
                !u.roleActivatedAt;

            if (needsUpdate) {
                updated++;
                if (!DRY_RUN) {
                    await User.updateOne(
                        { _id: u._id },
                        {
                            $set: {
                                role: primaryRole,
                                roles,
                                roleActivatedAt: u.roleActivatedAt || u.createdAt || new Date(),
                            },
                        }
                    );
                }
            } else {
                skipped++;
            }
        }

        console.log(`Migration Summary: Updated=${updated}, Skipped=${skipped} (${DRY_RUN ? "DRY RUN" : "COMPLETED"})`);
    } catch (err) {
        console.error("Role migration failed:", err);
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    }
}

module.exports = { migrateRoles };

if (require.main === module) {
  migrateRoles().catch((err) => {
    console.error("Migration execution failed:", err);
    process.exitCode = 1;
  });
}
