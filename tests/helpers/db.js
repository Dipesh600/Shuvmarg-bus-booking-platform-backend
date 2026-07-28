'use strict';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const processPort = 20000 + (process.pid % 40000);

const createDatabaseHelper = ({
  mongooseInstance = mongoose,
  createMongoServer = () => MongoMemoryServer.create({
    instance: { port: processPort },
  }),
} = {}) => {
  let mongoServer;
  let connectPromise;
  let disconnectPromise;
  let references = 0;

  const connect = async () => {
    if (disconnectPromise) await disconnectPromise;
    references += 1;

    if (mongooseInstance.connection.readyState === 1) {
      return mongooseInstance.connection;
    }
    if (!connectPromise) {
      connectPromise = (async () => {
        mongoServer = await createMongoServer();
        await mongooseInstance.connect(mongoServer.getUri());
        return mongooseInstance.connection;
      })().catch(async (error) => {
        references = 0;
        if (mongoServer) await mongoServer.stop();
        mongoServer = undefined;
        throw error;
      }).finally(() => {
        connectPromise = undefined;
      });
    }
    return connectPromise;
  };

  const clearAll = async () => {
    if (mongooseInstance.connection.readyState !== 1) return;
    const collections = Object.values(mongooseInstance.connection.collections);
    await Promise.all(collections.map((collection) => collection.deleteMany({})));
  };

  const disconnect = async () => {
    if (references > 0) references -= 1;
    if (references > 0) return;
    if (disconnectPromise) return disconnectPromise;
    if (!mongoServer && mongooseInstance.connection.readyState === 0 && !connectPromise) return;

    disconnectPromise = (async () => {
      if (connectPromise) await connectPromise;
      try {
        if (mongooseInstance.connection.readyState !== 0) {
          await mongooseInstance.connection.dropDatabase();
        }
      } finally {
        try {
          if (mongooseInstance.connection.readyState !== 0) {
            await mongooseInstance.connection.close();
          }
        } finally {
          if (mongoServer) await mongoServer.stop();
          mongoServer = undefined;
        }
      }
    })().finally(() => {
      disconnectPromise = undefined;
    });
    return disconnectPromise;
  };

  return { connect, clearAll, disconnect };
};

const databaseHelper = createDatabaseHelper();

module.exports = {
  ...databaseHelper,
  createDatabaseHelper,
};
