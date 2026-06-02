const mongoose = require("mongoose");
const { goLiveSchedule } = require("./services/scheduleService.js");

require("dotenv").config();

async function run() {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/shuvmarg");
    console.log("Connected to MongoDB");
    
    // Test the specific schedule
    const outbound = "6a03efb29235deb12da548f9";
    
    try {
        console.log("Running goLiveSchedule...");
        const result = await goLiveSchedule(outbound, null);
        console.log("Result:", result);
    } catch(e) {
        console.error("Fatal Error:", e);
    }
    
    // Wait a bit for setImmediate
    setTimeout(() => {
        console.log("Done waiting");
        process.exit(0);
    }, 5000);
}
run();
