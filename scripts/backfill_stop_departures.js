/**
 * ONE-TIME MIGRATION: Backfill estimatedDeparture for all OperatorRouteConfig documents.
 *
 * Problem:
 *   - haltDuration was not persisted (missing from schema) on older documents.
 *   - estimatedDeparture was not computed for auto-derived returnTimingConfig entries.
 *   - Result: stops showed empty departure time, falling back to raw terminal trip time.
 *
 * Fix:
 *   For each timingConfig / returnTimingConfig entry:
 *     estimatedDeparture = estimatedArrival + haltDuration (in minutes)
 *   - First stop: departure already set manually, no arrival → skip
 *   - Last stop:  arrival set, no departure needed → clear departure
 *   - Intermediate: arrival + halt = departure
 *
 * Usage:
 *   node scripts/backfill_stop_departures.js          # dry run (shows changes, no writes)
 *   node scripts/backfill_stop_departures.js --write  # writes to DB
 */

require("dotenv").config();
const mongoose = require("mongoose");
const OperatorRouteConfig = require("../models/operatorRouteConfigModel.js");

const DRY_RUN = !process.argv.includes("--write");

// ── Timing helpers (mirror of operatorRouteConfigService.js) ──────────────────

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

/**
 * Recompute departures for a timing array.
 * Returns { updated: TimingArray, changed: boolean, log: string[] }
 */
function recomputeArray(entries, label) {
  if (!entries || entries.length === 0) return { updated: entries, changed: false, log: [] };

  const log = [];
  let changed = false;

  const updated = entries.map((tc, idx) => {
    const arrival = (tc.estimatedArrival || "").trim();
    const halt    = typeof tc.haltDuration === "number" ? tc.haltDuration : 5; // default 5 if missing
    const isFirst = idx === 0;
    const isLast  = idx === entries.length - 1;

    // First stop: only a departure time, no arrival → leave untouched
    if (isFirst || !arrival) return tc;

    // Last stop: bus arrives and terminates → departure should be empty
    if (isLast) {
      if ((tc.estimatedDeparture || "").trim() !== "") {
        log.push(`  [${label}] idx=${idx} LAST STOP: cleared estimatedDeparture (was: ${tc.estimatedDeparture})`);
        changed = true;
      }
      return { ...tc, estimatedDeparture: "" };
    }

    // Intermediate stop: compute departure
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

// ── Main migration ────────────────────────────────────────────────────────────

async function run() {
  console.log(DRY_RUN
    ? "=== DRY RUN — no writes. Add --write flag to apply. ===\n"
    : "=== WRITE MODE — changes will be written to MongoDB. ===\n"
  );

  await mongoose.connect(process.env.MONGODB_URL);
  console.log("Connected to MongoDB:", process.env.MONGODB_URL, "\n");

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

run().catch(err => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
