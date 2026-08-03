/**
 * ARCHIVED MIGRATION SCRIPT METADATA
 * -----------------------------------
 * Execution Status: UNKNOWN
 * Execution Date: UNKNOWN
 * Affected Environment: UNKNOWN
 * Purpose: Backfill estimatedDeparture for OperatorRouteConfig documents missing haltDuration.
 * Affected Collections: operatorrouteconfigs
 * Rerun Safety: Idempotent: recalculates estimatedDeparture cleanly based on route config.
 * Dry-Run Support: Yes, via --write (default is dry-run).
 * Rollback or Recovery Reference: Restore from database backup.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const OperatorRouteConfig = require("../../models/operatorRouteConfigModel.js");

function _to12hMins(time) {
  if (!time || typeof time !== "string") return -1;
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return -1;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const pm = match[3].toUpperCase() === "PM";
  if (h === 12) h = 0;
  return (h + (pm ? 12 : 0)) * 60 + m;
}

function _minsTo12h(totalMins) {
  const m = totalMins % 60;
  let h24 = Math.floor(totalMins / 60) % 24;
  const pm = h24 >= 12;
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${pm ? "PM" : "AM"}`;
}

function recomputeArray(entries, label) {
  if (!entries || entries.length === 0) return { updated: entries, changed: false, log: [] };

  const log = [];
  let changed = false;

  const updated = entries.map((tc, idx) => {
    const arrival = (tc.estimatedArrival || "").trim();
    const halt    = typeof tc.haltDuration === "number" ? tc.haltDuration : 5;
    const isFirst = idx === 0;
    const isLast  = idx === entries.length - 1;

    if (isFirst || !arrival) return tc;

    if (isLast) {
      if ((tc.estimatedDeparture || "").trim() !== "") {
        log.push(`  [${label}] idx=${idx} LAST STOP: cleared estimatedDeparture (was: ${tc.estimatedDeparture})`);
        changed = true;
      }
      return { ...tc, estimatedDeparture: "" };
    }

    const arrMins = _to12hMins(arrival);
    if (arrMins < 0) {
      log.push(`  [${label}] idx=${idx} SKIP: unparseable arrival "${arrival}"`);
      return tc;
    }

    const correctDep = _minsTo12h(arrMins + halt);
    const existingDep = (tc.estimatedDeparture || "").trim();

    if (existingDep !== correctDep) {
      log.push(`  [${label}] idx=${idx} stopId=${tc.stopId} | arr=${arrival} + ${halt}min = dep SHOULD BE ${correctDep} (was: "${existingDep || "EMPTY"}")`);
      changed = true;
    }

    return { ...tc, estimatedDeparture: correctDep };
  });

  return { updated, changed, log };
}

async function run() {
  const DRY_RUN = !process.argv.includes("--write");

  console.log(DRY_RUN
    ? "=== DRY RUN — no writes. Add --write flag to apply. ===\n"
    : "=== WRITE MODE — changes will be written to MongoDB. ===\n"
  );

  const dbUri = process.env.MONGODB_URL || process.env.MONGO_URI;
  if (!dbUri) {
    console.error("❌ MONGODB_URL not found in environment.");
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(dbUri);
  console.log("Connected to MongoDB:", dbUri, "\n");

  const configs = await OperatorRouteConfig.find({}).lean();
  console.log(`Found ${configs.length} OperatorRouteConfig documents.\n`);

  let totalFixed = 0;
  let totalSkipped = 0;

  for (const cfg of configs) {
    const cfgId = cfg._id.toString();
    const label = `${cfgId.slice(-6)}`;

    const fwd = recomputeArray(cfg.timingConfig       || [], `FWD:${label}`);
    const ret = recomputeArray(cfg.returnTimingConfig  || [], `RET:${label}`);

    const needsUpdate = fwd.changed || ret.changed;

    if (!needsUpdate) {
      totalSkipped++;
      continue;
    }

    console.log(`Config ${cfgId}:`);
    [...fwd.log, ...ret.log].forEach(l => console.log(l));

    if (!DRY_RUN) {
      await OperatorRouteConfig.findByIdAndUpdate(cfgId, {
        $set: {
          timingConfig:       fwd.updated,
          returnTimingConfig: ret.updated,
        }
      });
      console.log(`  ✓ Written.\n`);
    } else {
      console.log(`  (dry run — not written)\n`);
    }

    totalFixed++;
  }

  console.log(`\n=== Done ===`);
  console.log(`  Fixed:   ${totalFixed}`);
  console.log(`  Already correct: ${totalSkipped}`);

  if (DRY_RUN && totalFixed > 0) {
    console.log(`\nRun with --write to apply ${totalFixed} fix(es).`);
  }

  await mongoose.disconnect();
}

module.exports = { run };

if (require.main === module) {
  run().catch(err => {
    console.error("Migration failed:", err.message);
    process.exitCode = 1;
  });
}
