const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { resetAll: resetOtpLimiters }   = require('../../middleware/otpRateLimiter.js');
const { resetAll: resetLoginLimiters } = require('../../middleware/loginRateLimiters.js');

let mongoServer;

const connect = async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
};

const clearAll = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany();
  }
  resetOtpLimiters();
  resetLoginLimiters();
};

const disconnect = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
};

module.exports = {
  connect,
  clearAll,
  disconnect,
};
