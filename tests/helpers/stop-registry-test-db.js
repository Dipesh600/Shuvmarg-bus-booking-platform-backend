"use strict";

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Stop = require("../../models/stopModel");

let mongoServer;

async function setupTestDb() {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  await Stop.syncIndexes();
}

async function teardownTestDb() {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
}

async function resetTestDb() {
  await Stop.deleteMany({});
  await Stop.syncIndexes();
}

module.exports = { setupTestDb, teardownTestDb, resetTestDb };
