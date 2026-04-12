const mongoose = require("mongoose");

const databaseConnection = async () => {
  try {
    mongoose.connect(process.env.MONGODB_URL);
    console.log("Connected to Database!");
  } catch (e) {
    console.error("Faild to connect", e);
  }
};
module.exports = databaseConnection;