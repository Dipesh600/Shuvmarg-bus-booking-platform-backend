/**
 * ARCHIVED MIGRATION SCRIPT METADATA
 * -----------------------------------
 * Execution Status: UNKNOWN
 * Execution Date: UNKNOWN
 * Affected Environment: UNKNOWN
 * Purpose: Backfill brandId field across Trips, Bookings, and Fleets for operator brand scoping.
 * Affected Collections: trips, booktickets, fleets
 * Rerun Safety: Idempotent when brandId is already present.
 * Dry-Run Support: Yes, via --dry-run.
 * Rollback or Recovery Reference: Restore from database backup or unset brandId on affected documents.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Trip    = require('../../models/tripModel');
const Booking = require('../../models/bookTicketModel');
const Fleet   = require('../../models/fleetModel');

async function runBackfill() {
    const DRY_RUN = process.argv.includes("--dry-run");

    console.log(DRY_RUN
        ? "🧪 [DRY RUN] Starting Data Backfill Preview: Trip & Booking brandId resolution (NO writes will be made)"
        : "🚀 Starting Data Backfill: Trip & Booking brandId resolution"
    );

    const dbUri = process.env.MONGODB_URL || process.env.MONGO_URI || process.env.DB_URI;
    if (!dbUri) {
        console.error("❌ MONGODB_URL/DB_URI not found in environment variables.");
        process.exitCode = 1;
        return;
    }

    try {
        await mongoose.connect(dbUri);
        console.log("✅ Connected to Database");

        const tripsToUpdate = await Trip.find({ brandId: null }).select('_id busId');
        console.log(`Found ${tripsToUpdate.length} Trips missing brandId.`);

        let tripSuccess = 0;
        let tripErrors  = 0;
        const tripDryRunLog = [];

        for (const trip of tripsToUpdate) {
            try {
                if (trip.busId) {
                    const fleet = await Fleet.findById(trip.busId).select('brandId').lean();
                    if (fleet && fleet.brandId) {
                        if (!DRY_RUN) {
                            await Trip.updateOne({ _id: trip._id }, { $set: { brandId: fleet.brandId } });
                        } else {
                            tripDryRunLog.push({ tripId: trip._id, wouldSetBrandId: fleet.brandId });
                        }
                        tripSuccess++;
                    } else {
                        tripErrors++;
                    }
                } else {
                    tripErrors++;
                }
            } catch (err) {
                console.error(`  ✗ Trip ${trip._id}: ${err.message}`);
                tripErrors++;
            }
        }

        if (DRY_RUN && tripDryRunLog.length > 0) {
            console.log("  [DRY RUN] Would update these Trips:");
            tripDryRunLog.forEach(e => console.log(`    Trip ${e.tripId} → brandId: ${e.wouldSetBrandId}`));
        }
        console.log(`${DRY_RUN ? "  [DRY RUN]" : "✅"} Trips ${DRY_RUN ? "to be" : ""} backfilled: ${tripSuccess} (Failed/NoBrand: ${tripErrors})`);

        const bookingsToUpdate = await Booking.find({ brandId: null }).select('_id tripId');
        console.log(`Found ${bookingsToUpdate.length} Bookings missing brandId.`);

        let bookingSuccess = 0;
        let bookingErrors  = 0;
        const bookingDryRunLog = [];

        for (const booking of bookingsToUpdate) {
            try {
                if (booking.tripId) {
                    const trip = await Trip.findById(booking.tripId).select('brandId').lean();
                    if (trip && trip.brandId) {
                        if (!DRY_RUN) {
                            await Booking.updateOne({ _id: booking._id }, { $set: { brandId: trip.brandId } });
                        } else {
                            bookingDryRunLog.push({ bookingId: booking._id, wouldSetBrandId: trip.brandId });
                        }
                        bookingSuccess++;
                    } else {
                        bookingErrors++;
                    }
                } else {
                    bookingErrors++;
                }
            } catch (err) {
                console.error(`  ✗ Booking ${booking._id}: ${err.message}`);
                bookingErrors++;
            }
        }

        if (DRY_RUN && bookingDryRunLog.length > 0) {
            console.log("  [DRY RUN] Would update these Bookings:");
            bookingDryRunLog.forEach(e => console.log(`    Booking ${e.bookingId} → brandId: ${e.wouldSetBrandId}`));
        }
        console.log(`${DRY_RUN ? "  [DRY RUN]" : "✅"} Bookings ${DRY_RUN ? "to be" : ""} backfilled: ${bookingSuccess} (Failed/NoBrand: ${bookingErrors})`);

    } catch (error) {
        console.error("❌ Fatal Error:", error);
        process.exitCode = 1;
    } finally {
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
        }
        console.log(DRY_RUN
            ? "🏁 [DRY RUN] Preview complete. No data was written. DB connection closed."
            : "🏁 Backfill complete, DB connection closed."
        );
    }
}

module.exports = { runBackfill };

if (require.main === module) {
    runBackfill().catch((err) => {
        console.error("Backfill failed:", err);
        process.exitCode = 1;
    });
}
