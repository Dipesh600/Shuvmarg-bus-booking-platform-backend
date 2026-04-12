const mongoose = require("mongoose");
const cron = require("node-cron");
const dbConnection = require("../db/db.js");
// const autoGenerateBusSchedules = require("../scripts/autoGenerateBusSchedules.js");

// Fix email index function
const fixEmailIndex = async () => {
    try {
        const User = require("../models/userModel.js");

        console.log("Checking email index...");

        const nullEmailUsers = await User.find({ email: null });
        if (nullEmailUsers.length > 1) {
            console.log(`Found ${nullEmailUsers.length} users with null email`);
            const idsToDelete = nullEmailUsers.slice(1).map((user) => user._id);
            await User.deleteMany({ _id: { $in: idsToDelete } });
            console.log(
                `Cleaned up ${idsToDelete.length} duplicate null email users`
            );
        }

        try {
            await User.collection.dropIndex("email_1");
            console.log("Dropped old email index");
        } catch (error) {
            if (error.code === 27) {
                console.log("ℹEmail index does not exist, will create new one");
            } else {
                console.log("ℹCould not drop index (might not exist):", error.message);
            }
        }

        // Create new sparse index
        await User.collection.createIndex(
            { email: 1 },
            { unique: true, sparse: true }
        );
        console.log("Created new sparse email index");
        console.log("Email index fixed successfully!");
    } catch (error) {
        console.error("Error fixing email index:", error.message);
        // Don't exit the app, just log the error
    }
};

const startServer = async (app, PORT) => {
    try {
        await dbConnection();
        console.log("Connection state:", mongoose.connection.readyState);
        // Fix email index after database connection
        await fixEmailIndex();

        // Schedule the bus schedule auto-generation to run every 2 minutes for testing
        // cron.schedule(
        //     "*/2 * * * *",
        //     () => {
        //         console.log(
        //             "Running bus schedule auto-generation every 2 minutes for testing..."
        //         );
        //         autoGenerateBusSchedules();
        //     },
        //     {
        //         timezone: "Asia/Kathmandu", // Set to your desired timezone
        //     }
        // );

        app.listen(PORT, () => {
            console.log("Server is running on port", PORT);
        });
    } catch (error) {
        console.error("Failed to connect to the database:", error);
        process.exit(1);
    }
};

module.exports = startServer;
