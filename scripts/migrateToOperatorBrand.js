const mongoose = require('mongoose');
const dotenv = require('dotenv');
const BusOwner = require('../models/busOwnerModel');
const Fleet = require('../models/fleetModel');
const OperatorBrand = require('../models/operatorBrandModel');
const OperatorRouteConfig = require('../models/operatorRouteConfigModel');

// Load environment variables
dotenv.config();

const migrateToOperatorBrand = async () => {
    try {
        console.log("🚀 Starting Operator Brand Architecture Migration...");
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URL || process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ Connected to MongoDB");

        // 1. Fetch all existing Bus Owners
        const busOwners = await BusOwner.find();
        console.log(`📦 Found ${busOwners.length} Bus Owners to process.`);

        let newBrandsCount = 0;
        let updatedFleetsCount = 0;
        let updatedConfigsCount = 0;

        for (const owner of busOwners) {
            // Check if this owner already has a brand
            let existingBrand = await OperatorBrand.findOne({ ownerId: owner._id });
            
            if (!existingBrand) {
                // Generate a brand name from company name or fallback
                const companyName = owner.busOwnerDoc?.companyName || owner.name || "Default Operator Brand";
                
                // Construct contact info
                const contactEmail = owner.email || "noreply@shuvmarg.com";
                const contactPhone = owner.phone || "0000000000";
                
                // Default commission rate
                const commissionRate = owner.commissionRate || 8;

                // Create the brand
                existingBrand = await OperatorBrand.create({
                    ownerId: owner._id,
                    brandName: companyName,
                    contactEmail,
                    contactPhone,
                    baseCity: owner.address || "Kathmandu",
                    commissionRate,
                    status: owner.status === "active" ? "ACTIVE" : "SUSPENDED"
                });
                console.log(`✅ Created brand [${existingBrand.brandCode}] for owner: ${companyName}`);
                newBrandsCount++;
            }

            // 2. Migrate existing Fleets to this brand
            // Find fleets belonging to this owner that do NOT have a brandId yet
            const fleetsToMigrate = await Fleet.find({ ownerId: owner._id, brandId: { $exists: false } });
            
            if (fleetsToMigrate.length > 0) {
                await Fleet.updateMany(
                    { ownerId: owner._id, brandId: { $exists: false } },
                    { $set: { brandId: existingBrand._id } }
                );
                
                // Also update the fleet count on the brand
                const totalFleetCount = await Fleet.countDocuments({ ownerId: owner._id });
                await OperatorBrand.findByIdAndUpdate(existingBrand._id, { fleetCount: totalFleetCount });
                
                updatedFleetsCount += fleetsToMigrate.length;
                console.log(`   ➔ Linked ${fleetsToMigrate.length} fleets to brand ${existingBrand.brandCode}`);
            }

            // 3. Migrate OperatorRouteConfig `operatorId` to `brandId`
            // If we have documents that still have the old `operatorId` field instead of `brandId`
            const oldConfigs = await OperatorRouteConfig.find({ operatorId: owner._id });
            if (oldConfigs.length > 0) {
                // We use mongoose's raw collection method to bypass strict schema validation during field rename
                await mongoose.connection.collection('operatorrouteconfigs').updateMany(
                    { operatorId: owner._id },
                    { 
                        $set: { brandId: existingBrand._id },
                        $unset: { operatorId: "" }
                    }
                );
                updatedConfigsCount += oldConfigs.length;
                console.log(`   ➔ Migrated ${oldConfigs.length} route configs to use brandId`);
            }
        }

        console.log("\n🎉 Migration completed successfully!");
        console.log("-----------------------------------------");
        console.log(`- Brands Created: ${newBrandsCount}`);
        console.log(`- Fleets Updated: ${updatedFleetsCount}`);
        console.log(`- Route Configs Migrated: ${updatedConfigsCount}`);
        console.log("-----------------------------------------");

        process.exit(0);
    } catch (error) {
        console.error("❌ Migration failed:", error);
        process.exit(1);
    }
};

migrateToOperatorBrand();
