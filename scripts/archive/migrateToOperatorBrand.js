/**
 * ARCHIVED MIGRATION SCRIPT METADATA
 * -----------------------------------
 * Execution Status: UNKNOWN
 * Execution Date: UNKNOWN
 * Affected Environment: UNKNOWN
 * Purpose: Migrate BusOwners and Fleets into OperatorBrand entities.
 * Affected Collections: busowners, fleets, operatorbrands, operatorrouteconfigs
 * Rerun Safety: Idempotent: checks for existing OperatorBrand records before creating.
 * Dry-Run Support: No.
 * Rollback or Recovery Reference: Remove created OperatorBrand documents.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const BusOwner = require('../../models/busOwnerModel');
const Fleet = require('../../models/fleetModel');
const OperatorBrand = require('../../models/operatorBrandModel');
const OperatorRouteConfig = require('../../models/operatorRouteConfigModel');

dotenv.config();

const migrateToOperatorBrand = async () => {
    const dbUri = process.env.MONGODB_URL || process.env.MONGO_URI;
    if (!dbUri) {
        console.error("❌ MONGODB_URL not found.");
        process.exitCode = 1;
        return;
    }

    try {
        console.log("🚀 Starting Operator Brand Architecture Migration...");

        await mongoose.connect(dbUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ Connected to MongoDB");

        const busOwners = await BusOwner.find();
        console.log(`📦 Found ${busOwners.length} Bus Owners to process.`);

        let newBrandsCount = 0;
        let updatedFleetsCount = 0;
        let updatedConfigsCount = 0;

        for (const owner of busOwners) {
            let brand = await OperatorBrand.findOne({ ownerId: owner._id });

            if (!brand) {
                brand = await OperatorBrand.create({
                    name: owner.companyName || `${owner.name}'s Transport`,
                    ownerId: owner._id,
                    status: owner.isVerified ? 'ACTIVE' : 'PENDING',
                });
                newBrandsCount++;
            }

            const fleetRes = await Fleet.updateMany(
                { busOwnerId: owner._id, brandId: null },
                { $set: { brandId: brand._id } }
            );
            updatedFleetsCount += fleetRes.modifiedCount;

            const configRes = await OperatorRouteConfig.updateMany(
                { operatorId: owner._id, brandId: null },
                { $set: { brandId: brand._id } }
            );
            updatedConfigsCount += configRes.modifiedCount;
        }

        console.log("🎉 Migration Finished Successfully!");
        console.log(`  - New Operator Brands Created: ${newBrandsCount}`);
        console.log(`  - Fleets Updated with brandId: ${updatedFleetsCount}`);
        console.log(`  - Route Configs Updated with brandId: ${updatedConfigsCount}`);

    } catch (error) {
        console.error("❌ Migration failed:", error);
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
    }
};

module.exports = { migrateToOperatorBrand };

if (require.main === module) {
  migrateToOperatorBrand().catch((err) => {
    console.error("Migration failed:", err);
    process.exitCode = 1;
  });
}
