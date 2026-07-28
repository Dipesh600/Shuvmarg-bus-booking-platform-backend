require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/userModel.js");
const Booking = require("../models/bookingModel.js");

async function run() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URL);
  const user = await User.findOne({ phone: '9804815308' });
  const bookings = await Booking.find({ userId: user._id });
  console.log(`User ${user.phone} has ${bookings.length} bookings.`);
  process.exit(0);
}
run();
