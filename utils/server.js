const mongoose = require("mongoose");
const cron = require("node-cron");
const dbConnection = require("../db/db.js");
// const autoGenerateBusSchedules = require("../scripts/autoGenerateBusSchedules.js");

// Fix email index function was removed because it was destructively deleting valid users without emails

const startServer = async (app, PORT) => {
    try {
        await dbConnection();
        console.log("Connection state:", mongoose.connection.readyState);

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
