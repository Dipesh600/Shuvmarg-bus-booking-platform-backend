/**
 * ARCHIVED MIGRATION SCRIPT METADATA
 * -----------------------------------
 * File: scripts/archive/fix_duplicate_stops.js
 * Execution Status: COMPLETED
 * Purpose: Merge duplicate stop records and update references in route configs.
 * Affected Collections: stops, operatorrouteconfigs
 * Rerun Safety: SAFE (Idempotent: merges duplicate stops based on normalized city names).
 */

/**
 * scripts/fix_duplicate_stops.js
 *
 * Finds stops that share the same name AND same district (true duplicates)
 * and merges the newer one into the older canonical record.
 *
 * Safe to run multiple times — idempotent.
 *
 * Usage:
 *   node scripts/fix_duplicate_stops.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Stop = require("../models/stopModel");
const StopPoint = require("../models/stopPointModel");

async function run() {
    const MONGO_URI = process.env.MONGODB_URL || process.env.MONGODB_URI;
    if (!MONGO_URI) { console.error("MONGODB_URL missing in .env"); process.exit(1); }

    await mongoose.connect(MONGO_URI);
    console.log("Connected to MongoDB.\n");

    // Find all stops, group by lowercase name + district
    const all = await Stop.find({}).select("_id name _nameLower district municipality province coordinates createdAt").lean();

    // Group: key = "lowercasename|districtlower"
    const groups = {};
    for (const s of all) {
        const namePart = (s._nameLower || s.name.toLowerCase()).trim();
        const distPart = (s.district || "").toLowerCase().trim();
        const key = `${namePart}|${distPart}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(s);
    }

    let mergedCount = 0;

    for (const [key, stops] of Object.entries(groups)) {
        if (stops.length <= 1) continue;

        // Sort oldest first — oldest is canonical
        stops.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        const canonical = stops[0];
        const duplicates = stops.slice(1);

        console.log(`\nDuplicate group: "${canonical.name}" in district "${canonical.district || "unknown"}"`);
        console.log(`  Canonical : ${canonical._id} (${canonical.name})`);

        for (const dup of duplicates) {
            console.log(`  Duplicate : ${dup._id} (${dup.name} / code-suffix) → merging into canonical`);

            // Re-point any StopPoints from the duplicate to the canonical
            const spResult = await StopPoint.updateMany(
                { stopId: dup._id },
                { $set: { stopId: canonical._id } }
            );
            if (spResult.modifiedCount > 0) {
                console.log(`    Moved ${spResult.modifiedCount} StopPoint(s) to canonical.`);
            }

            // Back-fill any missing data on canonical
            const updates = {};
            if (!canonical.province && dup.province)         updates.province     = dup.province;
            if (!canonical.district && dup.district)         updates.district     = dup.district;
            if (!canonical.municipality && dup.municipality) updates.municipality = dup.municipality;
            if ((!canonical.coordinates?.lat) && dup.coordinates?.lat) {
                updates["coordinates.lat"] = dup.coordinates.lat;
                updates["coordinates.lng"] = dup.coordinates.lng;
            }
            if (Object.keys(updates).length > 0) {
                await Stop.findByIdAndUpdate(canonical._id, { $set: updates });
                console.log(`    Back-filled canonical with: ${Object.keys(updates).join(", ")}`);
            }

            // Delete the duplicate
            await Stop.findByIdAndDelete(dup._id);
            console.log(`    Deleted duplicate stop ${dup._id}.`);
            mergedCount++;
        }
    }

    console.log(`\n── Done ────────────────────────────────────────────────────`);
    console.log(`  Merged & deleted: ${mergedCount} duplicate stop(s).`);

    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
    process.exit(0);
}

run().catch(err => { console.error("Fatal:", err); process.exit(1); });
