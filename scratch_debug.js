const mongoose = require("mongoose");
require("dotenv").config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log("Connected to MongoDB");

    // Load only specific models
    require("./models/adminModel.js");
    require("./models/userModel.js");
    require("./models/tripModel.js");
    require("./models/transactionModel.js");

    console.log("Registered Mongoose models:", mongoose.modelNames());

    // Try finding one disputed transaction and populating
    const Transaction = mongoose.model("Transaction");
    const result = await Transaction.find({ status: { $in: ["DISPUTED", "PAYMENT_RECEIVED", "REFUNDED"] } })
      .populate("userId", "name phone email")
      .populate("tripId", "tripId tripDate departureTime arrivalTime fromStopName toStopName directionLabel")
      .populate("bookingId", "ticketId seats status")
      .populate("resolvedBy", "name email")
      .limit(1)
      .lean();

    console.log("Query success! Found:", result.length);
    console.log("Result:", JSON.stringify(result, null, 2));

  } catch (error) {
    console.error("Error encountered:", error);
  } finally {
    await mongoose.disconnect();
  }
};

run();
