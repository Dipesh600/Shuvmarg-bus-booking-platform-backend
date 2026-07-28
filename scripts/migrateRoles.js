/**
 * scripts/migrateRoles.js
 *
 * One-time migration script for the multi-role identity system.
 *
 * What it does:
 *   1. For every User document, ensures `roles[]` contains the `role` value
 *   2. Backfills `roleActivatedAt` with the user's createdAt timestamp
 *   3. Removes "admin" from `role` and `roles[]` if present (admins use SuperAdmin)
 *
 * Usage:
 *   node scripts/migrateRoles.js --dry-run   # Preview changes (no writes)
 *   node scripts/migrateRoles.js             # Execute migration
 */

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/userModel.js");

const DRY_RUN = process.argv.includes("--dry-run");

const connectDB = async () => {
    const uri = process.env.MONGODB_URL || process.env.MONGO_URI || process.env.DB_URI;
    if (!uri) {
        console.error("❌ No MONGODB_URL, MONGO_URI, or DB_URI found in .env");
        process.exit(1);
    }
    await mongoose.connect(uri);
    console.log(`✅ Connected to MongoDB ${DRY_RUN ? "(DRY RUN)" : ""}`);
};

const migrate = async () => {
    const stats = {
        total: 0,
        alreadyOk: 0,
        rolesBackfilled: 0,
        roleActivatedAtBackfilled: 0,
        adminRoleRemoved: 0,
        errors: 0,
    };

    // Use cursor to handle large collections without loading all into memory
    const cursor = User.find({}).cursor();

    for await (const user of cursor) {
        stats.total++;
        let needsSave = false;

        // 1. Ensure roles[] contains the primary role
        if (!user.roles || user.roles.length === 0) {
            const primaryRole = user.role || "passenger";
            user.roles = [primaryRole];
            needsSave = true;
            stats.rolesBackfilled++;
        } else if (user.role && !user.roles.includes(user.role)) {
            user.roles.push(user.role);
            needsSave = true;
            stats.rolesBackfilled++;
        }

        // 2. Remove "admin" from roles (admins use separate SuperAdmin collection)
        if (user.role === "admin") {
            console.log(`  ⚠️  User ${user._id} (${user.phone}) has role="admin" — skipping (handle manually)`);
            stats.adminRoleRemoved++;
            continue;
        }
        if (user.roles.includes("admin")) {
            user.roles = user.roles.filter((r) => r !== "admin");
            needsSave = true;
            stats.adminRoleRemoved++;
        }

        // 3. Backfill roleActivatedAt
        if (!user.roleActivatedAt || user.roleActivatedAt.size === 0) {
            user.roleActivatedAt = new Map();
            for (const r of user.roles) {
                user.roleActivatedAt.set(r, user.createdAt || new Date());
            }
            needsSave = true;
            stats.roleActivatedAtBackfilled++;
        } else {
            // Fill in any missing entries
            for (const r of user.roles) {
                if (!user.roleActivatedAt.get(r)) {
                    user.roleActivatedAt.set(r, user.createdAt || new Date());
                    needsSave = true;
                    stats.roleActivatedAtBackfilled++;
                }
            }
        }

        if (needsSave) {
            if (DRY_RUN) {
                console.log(`  📝 Would update User ${user._id} (${user.phone}): roles=${JSON.stringify(user.roles)}, roleActivatedAt=${JSON.stringify(Object.fromEntries(user.roleActivatedAt))}`);
            } else {
                try {
                    // Use updateOne to bypass validation (some old users may have
                    // incomplete data that would fail new validators)
                    await User.updateOne(
                        { _id: user._id },
                        {
                            $set: {
                                roles: user.roles,
                                roleActivatedAt: Object.fromEntries(user.roleActivatedAt),
                            },
                        }
                    );
                } catch (err) {
                    console.error(`  ❌ Error updating User ${user._id}:`, err.message);
                    stats.errors++;
                }
            }
        } else {
            stats.alreadyOk++;
        }
    }

    return stats;
};

const main = async () => {
    try {
        await connectDB();

        console.log("\n🚀 Starting multi-role migration...\n");
        const stats = await migrate();

        console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log(`📊 Migration ${DRY_RUN ? "Preview" : "Complete"}`);
        console.log(`   Total users:              ${stats.total}`);
        console.log(`   Already OK:               ${stats.alreadyOk}`);
        console.log(`   roles[] backfilled:       ${stats.rolesBackfilled}`);
        console.log(`   roleActivatedAt filled:   ${stats.roleActivatedAtBackfilled}`);
        console.log(`   Admin role flagged:        ${stats.adminRoleRemoved}`);
        console.log(`   Errors:                   ${stats.errors}`);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

        if (DRY_RUN) {
            console.log("💡 Run without --dry-run to apply changes.\n");
        }
    } catch (err) {
        console.error("Fatal error:", err);
    } finally {
        await mongoose.disconnect();
        console.log("🔌 Disconnected from MongoDB.");
    }
};

main();
