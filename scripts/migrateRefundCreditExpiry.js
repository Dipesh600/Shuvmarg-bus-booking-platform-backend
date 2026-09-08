"use strict";
const mongoose = require("mongoose");
const SMLedger = require("../models/smLedgerModel");

const refundExpiryFilter = () => ({
  type: "REFUND", direction: "CREDIT", expires_at: { $ne: null },
});

async function migrateRefundCreditExpiry(model, { apply = false } = {}) {
  const filter = refundExpiryFilter();
  const candidates = await model.countDocuments(filter);
  if (!apply) return { mode: "DRY_RUN", candidates, modified: 0 };
  const result = await model.updateMany(filter, { $set: { expires_at: null } });
  return { mode: "APPLIED", candidates, matched: result.matchedCount, modified: result.modifiedCount };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const uri = apply ? process.env.PAYMENT_MIGRATION_MONGODB_URI : process.env.PAYMENT_AUDIT_MONGODB_URI;
  if (!uri) throw new Error(`Dedicated ${apply ? "migration" : "audit"} connection is required`);
  if (apply && process.env.CONFIRM_REFUND_CREDIT_MIGRATION !== "REMOVE_REFUND_EXPIRY") {
    throw new Error("Explicit refund-credit migration confirmation is required");
  }
  await mongoose.connect(uri, {
    autoIndex: false, autoCreate: false, readConcern: { level: "majority" },
    ...(apply ? {} : { readPreference: "secondaryPreferred" }), serverSelectionTimeoutMS: 15000,
  });
  try { console.log(JSON.stringify(await migrateRefundCreditExpiry(SMLedger, { apply }))); }
  finally { await mongoose.disconnect(); }
}

if (require.main === module) main().catch(() => {
  process.stderr.write("Refund-credit expiry migration failed. Check the dedicated connection and requested mode.\n");
  process.exitCode = 1;
});
module.exports = { refundExpiryFilter, migrateRefundCreditExpiry };
