require('dotenv').config();
const mongoose = require('mongoose');

const Trip    = require('../models/tripModel');
const Booking = require('../models/bookTicketModel');
const Fleet   = require('../models/fleetModel');

// G1 FIX: Dry-run mode — reports what would be changed without writing to the DB.
// Usage:
//   node scripts/backfillBrandId.js           → real backfill (writes to DB)
//   node scripts/backfillBrandId.js --dry-run → preview only (no writes)
const DRY_RUN = process.argv.includes("--dry-run");

async function runBackfill() {
    console.log(DRY_RUN
        ? "🧪 [DRY RUN] Starting Data Backfill Preview: Trip & Booking brandId resolution (NO writes will be made)"
        : "🚀 Starting Data Backfill: Trip & Booking brandId resolution"
    );

    if (!process.env.DB_URI) {
        console.error("❌ DB_URI not found in environment variables.");
        process.exit(1);
    }

    try {
        await mongoose.connect(process.env.DB_URI);
        console.log("✅ Connected to Database");

        // --- 1. Trips ---
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

        // --- 2. Bookings ---
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
    } finally {
        await mongoose.disconnect();
        console.log(DRY_RUN
            ? "🏁 [DRY RUN] Preview complete. No data was written. DB connection closed."
            : "🏁 Backfill complete, DB connection closed."
        );
    }
}

runBackfill();
