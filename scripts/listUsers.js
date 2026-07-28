require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/userModel.js");

async function run() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URL);
  const users = await User.find({}, 'phone role roles');
  console.log(users);
  process.exit(0);
}
run();
