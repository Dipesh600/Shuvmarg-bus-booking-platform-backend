const mongoose = require("mongoose");
require("dotenv").config({ path: ".env" });

async function run() {
  await mongoose.connect(process.env.MONGODB_URL);
  const user = await mongoose.connection.db.collection("users").findOne({ _id: new mongoose.Types.ObjectId("69ddc54aee0709edb199bae1") });
  const admin = await mongoose.connection.db.collection("admins").findOne({ _id: new mongoose.Types.ObjectId("69ddc54aee0709edb199bae1") });
  console.log("User:", user);
  console.log("Admin:", admin);
  
  // also print superadmins
  const sa = await mongoose.connection.db.collection("superadmins").findOne();
  console.log("SuperAdmin:", sa);
  process.exit(0);
}
run();
