'use strict';
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { createDatabaseHelper } = require('./db');
module.exports = createDatabaseHelper({
  createMongoServer: () => MongoMemoryReplSet.create({ replSet: { count: 1 } }),
});
