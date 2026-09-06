"use strict";
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const Operation = require("../../models/financialOperationModel");
const { withMongoTransaction } = require("./with-mongo-transaction");
const failure = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const validateOperationId = id => typeof id === "string" && /^[a-zA-Z0-9_-]{16,128}$/.test(id);
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonical(value[key])])
  );
  return value;
};

async function runOperation({ scope, operationId, actorId, payload, work }) {
  if (!validateOperationId(operationId)) throw failure(400, "A valid operationId is required for this money change");
  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(canonical(payload))).digest("hex");
  const reuse = existing => {
    if (existing.fingerprint !== fingerprint || existing.actorId !== String(actorId)) {
      throw failure(409, "This operationId belongs to a different money change");
    }
    if (existing.result === null) throw failure(409, "The money change requires reconciliation");
    return existing.result;
  };
  try {
    return await withMongoTransaction(mongoose, null, async session => {
      const existing = await Operation.findOne({ scope, operationId }).session(session);
      if (existing) return reuse(existing);
      const [operation] = await Operation.create([{ scope, operationId, fingerprint,
        actorId: String(actorId), payload }], { session });
      const result = await work(session);
      operation.result = result;
      await operation.save({ session });
      return result;
    });
  } catch (error) {
    // A competing insert may report a duplicate key instead of a write conflict.
    // Reuse only a matching committed operation; never repeat its money movement.
    if (error.code === 11000) {
      const existing = await Operation.findOne({ scope, operationId });
      if (existing) return reuse(existing);
    }
    throw error;
  }
}

module.exports = { runOperation, validateOperationId };
