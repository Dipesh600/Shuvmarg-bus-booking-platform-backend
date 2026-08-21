"use strict";

const mongoose = require("mongoose");

function transactionUnsupported(error) {
  return /Transaction numbers are only allowed|replica set member|mongos|does not support transactions/i
    .test(String(error?.message || ""));
}

function transientTransactionFailure(error) {
  if (typeof error?.hasErrorLabel === "function" && error.hasErrorLabel("TransientTransactionError")) {
    return true;
  }
  const labels = error?.errorLabels || error?.errorResponse?.errorLabels;
  return error?.code === 251 ||
    (Array.isArray(labels) && labels.includes("TransientTransactionError"));
}

function transactionsAvailable(mongooseImpl = mongoose) {
  return typeof mongooseImpl?.startSession === "function" &&
    mongooseImpl.connection?.readyState === 1;
}

/**
 * Prefer one MongoDB transaction for a multi-collection variant write. Local
 * standalone MongoDB instances cannot run transactions, so callers provide a
 * compensating fallback that keeps a retryable, internally consistent draft.
 */
async function runVariantWrite({ transactionWork, fallbackWork, mongooseImpl = mongoose }) {
  if (!transactionsAvailable(mongooseImpl)) return fallbackWork();
  let session;
  try {
    session = await mongooseImpl.startSession();
    let result;
    await session.withTransaction(async () => {
      result = await transactionWork(session);
    });
    return result;
  } catch (error) {
    if (transactionUnsupported(error) || transientTransactionFailure(error)) {
      return fallbackWork();
    }
    throw error;
  } finally {
    if (session) await session.endSession();
  }
}

module.exports = {
  runVariantWrite,
  transactionUnsupported,
  transactionsAvailable,
  transientTransactionFailure,
};
