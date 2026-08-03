/**
 * ARCHIVED MIGRATION SCRIPT METADATA
 * -----------------------------------
 * File: scripts/archive/migrate_boarding_points.js
 * Execution Status: COMPLETED
 * Purpose: Migrate legacy BoardingPoints records into the StopPoint model.
 * Affected Collections: boardingpoints, stopPoints
 * Rerun Safety: SAFE (Idempotent: skips existing StopPoint records).
 */

/**
 * scripts/migrate_boarding_points.js
 *
 * Migrates all legacy BoardingPoints records to the new StopPoint model.
 *
 * What it does:
 *   1. Reads every record from the BoardingPoints collection
 *   2. For each, looks up the matching Stop by city name (case-insensitive)
 *   3. If a matching Stop exists → creates a StopPoint linked via stopId
 *   4. If no matching Stop → logs as unmatched (skips, does NOT create orphan StopPoint)
 *   5. Skips if an identical StopPoint already exists (idempotent — safe to re-run)
 *
 * Mapping:
 *   BoardingPoints.city        → Stop name lookup → StopPoint.stopId
 *   BoardingPoints.pointName   → StopPoint.name
 *   BoardingPoints.landmark    → embedded in StopPoint.name as "(near {landmark})"
 *   BoardingPoints.coordinates → StopPoint.coordinates
 *   BoardingPoints.type        → StopPoint.supportsBoarding / supportsDropping
 *   BoardingPoints.isGlobal    → StopPoint.source = "MANUAL" (global = created by admin)
 *
 * Usage:
 *   node scripts/migrate_boarding_points.js
 *
 * Safe to re-run: uses findOne-before-create to skip already migrated records.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const BoardingPoints = require("../models/boardingPointsModel");
const StopPoint = require("../models/stopPointModel");
const Stop = require("../models/stopModel");

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
    const MONGO_URI = process.env.MONGODB_URL || process.env.MONGODB_URI;
    if (!MONGO_URI) {
        console.error("MONGODB_URL missing in .env");
        process.exit(1);
    }

    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB.\n");

    const all = await BoardingPoints.find({}).lean();
    console.log(`Found ${all.length} legacy BoardingPoint records to migrate.\n`);

    let created = 0;
    let skipped = 0;
    let unmatched = 0;

    for (const bp of all) {
        const cityName = (bp.city || "").trim();
        const pointName = (bp.pointName || "").trim();

        if (!cityName || !pointName) {
            console.log(`  [SKIP] Record ${bp._id} missing city or pointName.`);
            skipped++;
            continue;
        }

        // ── Find matching Stop ───────────────────────────────────────────────
        // Primary: exact _nameLower match (fast index lookup)
        // Fallback: case-insensitive regex (catches stops where _nameLower was never set)
        let stop = await Stop.findOne({
            _nameLower: cityName.toLowerCase(),
        }).select("_id name").lean();

        if (!stop) {
            stop = await Stop.findOne({
                name: { $regex: new RegExp(`^${cityName}$`, "i") },
            }).select("_id name").lean();
        }

        if (!stop) {
            console.log(`  [UNMATCHED] No Stop found for city="${cityName}" (pointName="${pointName}")`);
            unmatched++;
            continue;
        }

        // ── Map type → supportsBoarding / supportsDropping ───────────────────
        const supportsBoarding = bp.type !== "DROPPING";
        const supportsDropping = bp.type !== "BOARDING";

        // ── Build StopPoint name (append landmark if present) ────────────────
        const landmark = (bp.landmark || "").trim();
        const spName = landmark ? `${pointName} (near ${landmark})` : pointName;

        // ── Skip if already migrated ─────────────────────────────────────────
        const existing = await StopPoint.findOne({
            stopId: stop._id,
            name:   spName,
        }).lean();

        if (existing) {
            console.log(`  [EXISTS] "${spName}" at ${stop.name} — skipping.`);
            skipped++;
            continue;
        }

        // ── Create StopPoint ─────────────────────────────────────────────────
        await StopPoint.create({
            stopId:            stop._id,
            name:              spName,
            type:              "CUSTOM",
            coordinates: {
                lat: bp.coordinates?.lat || null,
                lng: bp.coordinates?.lng || null,
            },
            supportsBoarding,
            supportsDropping,
            verificationStatus: "VERIFIED",
            source:            "MANUAL",
            status:            bp.status === false ? "INACTIVE" : "ACTIVE",
        });

        console.log(`  [CREATED] "${spName}" → Stop: ${stop.name} (${stop._id})`);
        created++;

        await delay(50); // small pause to avoid hammering the DB
    }

    console.log("\n── Migration complete ──────────────────────────────────────");
    console.log(`  Created : ${created}`);
    console.log(`  Skipped (already exist or missing data): ${skipped}`);
    console.log(`  Unmatched (no Stop found for city name): ${unmatched}`);

    if (unmatched > 0) {
        console.log(
            "\n  [ACTION REQUIRED] The unmatched records above could not be linked to a Stop.\n" +
            "  Options:\n" +
            "    1. Add missing city names to the Stop registry, then re-run this script.\n" +
            "    2. Manually create StopPoints for those cities via the admin panel."
        );
    }

    await mongoose.disconnect();
    console.log("\nDisconnected from MongoDB.");
    process.exit(0);
}

run().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
