const mongoose = require("mongoose");

/**
 * db/db.js
 *
 * Establishes the Mongoose connection.
 *
 * Throws on any failure — callers (startServer) are responsible for
 * catching errors and terminating the process with a non-zero exit code.
 * No try/catch here so errors propagate cleanly.
 */
const databaseConnection = async () => {
  if (!process.env.MONGODB_URL) {
    throw new Error("MONGODB_URL environment variable is not set.");
  }
  await mongoose.connect(process.env.MONGODB_URL);
};

module.exports = databaseConnection;
