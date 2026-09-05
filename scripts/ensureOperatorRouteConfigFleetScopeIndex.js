'use strict';

const mongoose = require('mongoose');

const COLLECTION_NAME = 'operatorrouteconfigs';
const OLD_UNIQUE_INDEX = 'brandId_1_variantId_1_patternName_1';
const NEW_UNIQUE_INDEX = 'brandId_1_variantId_1_fleetId_1_patternName_1';

async function ensureOperatorRouteConfigFleetScopeIndex(
  mongooseInstance = mongoose
) {
  const collection = mongooseInstance.connection.collection(COLLECTION_NAME);
  const indexes = await collection.indexes();
  const hasOldIndex = indexes.some((index) => index.name === OLD_UNIQUE_INDEX);

  if (hasOldIndex) {
    await collection.dropIndex(OLD_UNIQUE_INDEX);
  }

  await collection.createIndex(
    { brandId: 1, variantId: 1, fleetId: 1, patternName: 1 },
    { unique: true, name: NEW_UNIQUE_INDEX }
  );

  return { success: true, droppedOldIndex: hasOldIndex };
}

if (require.main === module) {
  require('dotenv').config();
  const mongoUrl = process.env.MONGODB_URL;
  if (!mongoUrl?.trim()) {
    console.error(
      '[db:index:operator-route-config] MONGODB_URL is required.'
    );
    process.exitCode = 1;
    return;
  }
  mongoose
    .connect(mongoUrl)
    .then(async () => {
      const result = await ensureOperatorRouteConfigFleetScopeIndex();
      console.log(
        `[db:index:operator-route-config] Fleet-scoped index ensured. droppedOldIndex=${result.droppedOldIndex}`
      );
    })
    .catch((error) => {
      console.error(
        '[db:index:operator-route-config] Index migration failed:',
        error.message
      );
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}

module.exports = ensureOperatorRouteConfigFleetScopeIndex;
