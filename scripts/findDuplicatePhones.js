const mongoose = require("mongoose");
const path = require("path");

// Load env vars
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const dbConnection = require("../db/db.js");
const User = require("../models/userModel.js");

const findDuplicates = async () => {
    try {
        console.log("Connecting to database...");
        await dbConnection();

        console.log("Scanning the Users collection for duplicate phone numbers...");

        // Aggregate to find phones that appear more than once
        const duplicates = await User.aggregate([
            {
                $group: {
                    _id: "$phone",
                    count: { $sum: 1 },
                    accounts: {
                        $push: {
                            id: "$_id",
                            name: "$name",
                            role: "$role",
                            status: "$status",
                            createdAt: "$createdAt"
                        }
                    }
                }
            },
            {
                $match: {
                    count: { $gt: 1 },
                    _id: { $ne: null } // Ignore documents where phone is null, just in case
                }
            },
            {
                $sort: { count: -1 } // Sort by most duplicates first
            }
        ]);

        if (duplicates.length === 0) {
            console.log("\n✅ Good news! No duplicate phone numbers found across the platform.");
        } else {
            console.log(`\n⚠️ Found ${duplicates.length} phone number(s) attached to multiple accounts:\n`);
            
            let totalAccountsImpacted = 0;

            duplicates.forEach((dup, index) => {
                totalAccountsImpacted += dup.count;
                console.log(`[${index + 1}] Phone: ${dup._id} (${dup.count} accounts)`);
                dup.accounts.forEach(acc => {
                    console.log(`    ↳ Role: ${acc.role.padEnd(10)} | Status: ${acc.status.padEnd(8)} | Name: ${acc.name} | ID: ${acc.id}`);
                });
                console.log("--------------------------------------------------");
            });

            console.log(`\nSummary:`);
            console.log(`- Unique Phone Numbers with Duplicates: ${duplicates.length}`);
            console.log(`- Total Individual Accounts Impacted: ${totalAccountsImpacted}`);
            console.log(`\nRecommendation: For the accounts above, you may want to append '-legacy' to the phone number of the less-used role so they don't conflict.`);
        }

    } catch (error) {
        console.error("Error running script:", error);
    } finally {
        // Close DB connection and exit
        mongoose.disconnect();
        process.exit(0);
    }
};

findDuplicates();
