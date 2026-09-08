"use strict";

const mongoose = require("mongoose");
const { once } = require("node:events");
const SMLedger = require("../models/smLedgerModel");
const { auditDebitReversals } = require("../src/modules/wallet/sm-ledger/sm-ledger-reversal-audit");

async function emit(value) {
  if (!process.stdout.write(JSON.stringify(value) + "\n")) await once(process.stdout, "drain");
}

async function main() {
  if (!process.env.PAYMENT_AUDIT_MONGODB_URI) throw new Error("Dedicated audit connection is required");
  // No dotenv or application bootstrap; no collection or index creation on connect.
  await mongoose.connect(process.env.PAYMENT_AUDIT_MONGODB_URI, {
    autoIndex: false, autoCreate: false, readConcern: { level: "majority" },
    readPreference: "secondaryPreferred", maxPoolSize: 2, serverSelectionTimeoutMS: 15000,
  });
  const counts = {};
  let examined = 0;
  let flagged = 0;
  await emit({ record: "start", startedAt: new Date().toISOString(), readOnly: true });
  for await (const result of auditDebitReversals(SMLedger)) {
    examined++;
    if (result.reasons.length) flagged++;
    for (const reason of result.reasons) counts[reason] = (counts[reason] || 0) + 1;
    await emit({ record: "entry", ...result });
  }
  await emit({ record: "summary", completedAt: new Date().toISOString(), examined, flagged, counts });
}

main().catch(() => {
  // Connection errors can contain credentials; never echo the URI or raw error.
  process.stderr.write("Reversal audit failed. Check the read-only connection and database availability. Report is incomplete without a summary.\n");
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
