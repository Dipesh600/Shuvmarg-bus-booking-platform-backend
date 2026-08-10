"use strict";

const mongoose = require("mongoose");
const RouteStop = require("../../../../models/routeStopModel.js");
const { routeVariantError } = require("./route-variant-errors.js");

function transactionsAvailable() {
  return mongoose.connection?.readyState === 1;
}

function transactionUnsupported(error) {
  return /Transaction numbers are only allowed|replica set member|mongos/i
    .test(String(error?.message || ""));
}

async function replaceWithCompensation(variantId, rows, previousRows) {
  try {
    await RouteStop.deleteMany({ variantId });
    return await RouteStop.insertMany(rows, { ordered: true });
  } catch (error) {
    try {
      await RouteStop.deleteMany({ variantId });
      if (previousRows.length > 0) {
        await RouteStop.insertMany(previousRows, { ordered: true });
      }
    } catch (restoreError) {
      throw routeVariantError(
        "ROUTE_STOP_SEQUENCE_RESTORE_FAILED",
        "The route-stop sequence could not be saved and its previous sequence could not be restored.",
        500,
        { cause: error.message, restoreCause: restoreError.message }
      );
    }
    throw error;
  }
}

async function replaceVariantStopSequence(variantId, rows, { session: suppliedSession = null } = {}) {
  if (suppliedSession) {
    await RouteStop.deleteMany({ variantId }, { session: suppliedSession });
    return RouteStop.insertMany(rows, { ordered: true, session: suppliedSession });
  }
  const previousRows = await RouteStop.find({ variantId }).lean();
  if (!transactionsAvailable()) {
    return replaceWithCompensation(variantId, rows, previousRows);
  }
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      await RouteStop.deleteMany({ variantId }, { session });
      result = await RouteStop.insertMany(rows, { ordered: true, session });
    });
    return result;
  } catch (error) {
    if (transactionUnsupported(error)) {
      return replaceWithCompensation(variantId, rows, previousRows);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

module.exports = { replaceVariantStopSequence };
