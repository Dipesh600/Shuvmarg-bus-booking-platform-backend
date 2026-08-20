#!/usr/bin/env node
"use strict";

require("dotenv").config();
const mongoose = require("mongoose");
const { runBrandFleetPreflightAudit } = require("../src/modules/fleet-management/preflight-brand-fleet-audit");

function sanitizeMongoUri(uri) {
  try {
    const parsed = new URL(uri);
    if (parsed.password) {
      parsed.password = "****";
    }
    return parsed.toString();
  } catch {
    return uri.replace(/(:\/\/[^:]+:)([^@]+)(@)/, "$1****$3");
  }
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri || typeof mongoUri !== "string" || !mongoUri.trim()) {
    console.error("[PREFLIGHT ERROR] Database URI is required. Set MONGODB_URI or MONGO_URI in your environment.");
    process.exit(1);
  }

  const isConnected = mongoose.connection.readyState === 1;

  if (!isConnected) {
    console.log(`[PREFLIGHT] Connecting to database: ${sanitizeMongoUri(mongoUri.trim())}`);
    await mongoose.connect(mongoUri.trim());
  }

  try {
    const report = await runBrandFleetPreflightAudit();
    console.log(JSON.stringify(report, null, 2));

    if (report.summary.hasBlockingConflicts) {
      console.error(
        `\n[PREFLIGHT FAILED] Blocking conflicts detected (Schema: ${report.summary.schemaBlockersCount}, Submission: ${report.summary.submissionBlockersCount}, Operational: ${report.summary.operationalBlockersCount}).`
      );
      process.exit(1);
    } else {
      console.log("\n[PREFLIGHT PASSED] Zero blocking conflicts detected across schema, submission, and operations.");
      process.exit(0);
    }
  } catch (error) {
    console.error("[PREFLIGHT ERROR]", error);
    process.exit(1);
  } finally {
    if (!isConnected) {
      await mongoose.disconnect();
    }
  }
}

if (require.main === module) {
  main();
}
