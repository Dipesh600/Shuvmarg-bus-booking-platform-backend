require("dotenv").config();
const mongoose = require("mongoose");
const Trip = require("./models/tripModel");
const Seat = require("./models/seatsModel");

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URL);
    const trips = await Trip.find().limit(2);
    console.log("Found trips:", trips.map(t => t._id));
    for (let t of trips) {
        const seat = await Seat.findOne({ tripId: t._id });
        console.log("Seat for trip", t._id, ":", seat ? "Exists with seata count: " + seat.seata.length : "NOT FOUND");
    }
    process.exit(0);
};
run();
