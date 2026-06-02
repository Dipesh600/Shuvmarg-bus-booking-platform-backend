/**
 * tripExceptionService.js
 *
 * Trip-level exception management — the GTFS calendar_dates pattern.
 *
 * These operations affect INDIVIDUAL TRIPS on SPECIFIC DATES without
 * touching the master Schedule document. The master schedule continues
 * generating future trips normally.
 *
 * Edge cases covered:
 *   1. cancelTrip          — single trip cancelled (breakdown, emergency)
 *   2. rescheduleTrip      — single trip time-shifted (road work, delay)
 *   3. cancelDateRange     — bulk cancel trips in a window (maintenance, holiday)
 *   4. createExtraRun      — one-off trip on a date not in the regular schedule
 */

const Trip     = require("../models/tripModel");
const Booking  = require("../models/bookTicketModel");
const Schedule = require("../models/scheduleModel");
const logger   = require("../utils/logger");

// ─── 1. CANCEL SINGLE TRIP ────────────────────────────────────────────────────
/**
 * Cancel one specific trip instance.
 *
 * What this does:
 *   - Sets trip.status = "cancelled", exceptionType = "CANCELLED"
 *   - Records cancelledBy, cancelledAt, cancellationReason
 *   - Releases all booked seats (booking status → "cancelled")
 *   - Returns the impacted booking count for the API response
 *
 * What this does NOT do:
 *   - Touch the master Schedule (it keeps generating future trips)
 *   - Cancel any other trips on other dates
 */
const cancelTrip = async (tripId, reason, adminId) => {
    if (!reason) throw new Error("Cancellation reason is required.");

    const trip = await Trip.findById(tripId);
    if (!trip)                                            throw new Error("Trip not found.");
    if (trip.status === "completed")                      throw new Error("Cannot cancel a completed trip.");
    if (trip.status === "cancelled")                      throw new Error("This trip is already cancelled.");
    if (trip.status === "in-transit")                     throw new Error("Cannot cancel a trip that is in-transit. Mark it arrived first.");

    // Cancel the trip
    trip.status              = "cancelled";
    trip.exceptionType       = "CANCELLED";
    trip.cancellationReason  = reason;
    trip.cancelledBy         = adminId;
    trip.cancelledAt         = new Date();
    await trip.save();

    // Release all active bookings for this trip
    const bookingResult = await Booking.updateMany(
        { tripId: trip._id, status: { $in: ["booked", "pending"] } },
        {
            $set: {
                status: "cancelled",
                cancellationReason: `Trip cancelled by operator: ${reason}`,
            }
        }
    );

    logger.info("tripExceptionService: trip cancelled", {
        tripId, reason, adminId,
        bookingsReleased: bookingResult.modifiedCount,
    });

    return {
        trip,
        bookingsReleased: bookingResult.modifiedCount,
    };
};

// ─── 2. RESCHEDULE SINGLE TRIP ────────────────────────────────────────────────
/**
 * Change the departure/arrival times for ONE trip on ONE specific date.
 *
 * Use case: "The bus is 2 hours late on May 20th due to road work."
 * The master schedule stays 07:00. Only the May 20th trip becomes 09:00.
 *
 * What this does:
 *   - Preserves original times in originalDepartureTime / originalArrivalTime
 *   - Updates departureTime, arrivalTime, bookingClosesAt
 *   - Sets exceptionType = "RESCHEDULED"
 *   - Does NOT cancel bookings (passengers keep their seats, just different time)
 */
const rescheduleTrip = async (tripId, { newDepartureTime, newArrivalTime, reason }, adminId) => {
    if (!newDepartureTime) throw new Error("newDepartureTime is required.");
    if (!newArrivalTime)   throw new Error("newArrivalTime is required.");
    if (!reason)           throw new Error("Reschedule reason is required.");

    const timeRx = /^\d{2}:\d{2}$/;
    if (!timeRx.test(newDepartureTime)) throw new Error("newDepartureTime must be HH:MM.");
    if (!timeRx.test(newArrivalTime))   throw new Error("newArrivalTime must be HH:MM.");

    const trip = await Trip.findById(tripId);
    if (!trip)                      throw new Error("Trip not found.");
    if (trip.status === "completed") throw new Error("Cannot reschedule a completed trip.");
    if (trip.status === "cancelled") throw new Error("Cannot reschedule a cancelled trip.");
    if (trip.status === "in-transit") throw new Error("Trip is already in-transit.");

    // Preserve originals only on the first reschedule
    if (!trip.originalDepartureTime) trip.originalDepartureTime = trip.departureTime;
    if (!trip.originalArrivalTime)   trip.originalArrivalTime   = trip.arrivalTime;

    // Update the trip timings
    trip.departureTime    = newDepartureTime;
    trip.arrivalTime      = newArrivalTime;
    trip.exceptionType    = "RESCHEDULED";
    trip.rescheduleReason = reason;
    trip.rescheduledBy    = adminId;
    trip.rescheduledAt    = new Date();

    // Recalculate bookingClosesAt based on new departure time
    const schedule = trip.scheduleId ? await Schedule.findById(trip.scheduleId).select("bookingCutoffHours").lean() : null;
    const cutoffHours = schedule?.bookingCutoffHours ?? 2;
    const [h, m] = newDepartureTime.split(":").map(Number);
    const newDep = new Date(trip.tripDate);
    newDep.setHours(h, m, 0, 0);
    trip.bookingClosesAt = new Date(newDep.getTime() - cutoffHours * 3600000);

    await trip.save();

    logger.info("tripExceptionService: trip rescheduled", {
        tripId,
        originalDepartureTime: trip.originalDepartureTime,
        newDepartureTime,
        reason,
        adminId,
    });

    return { trip };
};

// ─── 3. CANCEL DATE RANGE ─────────────────────────────────────────────────────
/**
 * Cancel ALL trips for a schedule between two dates (inclusive).
 *
 * Use case: "Bus goes to maintenance May 20–25. Cancel all trips in that window."
 * The master schedule is NOT suspended — it will resume normally after the window.
 * Unlike suspendSchedule, this is a TARGETED EXCEPTION on a specific date range.
 *
 * What this does:
 *   - Finds all non-completed, non-cancelled trips in [fromDate, toDate]
 *   - Cancels each trip and releases its bookings
 *   - Returns a summary of trips and bookings affected
 */
const cancelDateRange = async (scheduleId, fromDate, toDate, reason, adminId) => {
    if (!reason)   throw new Error("Cancellation reason is required.");
    if (!fromDate) throw new Error("fromDate is required.");
    if (!toDate)   throw new Error("toDate is required.");

    const start = new Date(fromDate);
    const end   = new Date(toDate);
    end.setHours(23, 59, 59, 999); // inclusive end

    if (isNaN(start.getTime()) || isNaN(end.getTime())) throw new Error("Invalid date format.");
    if (start > end) throw new Error("fromDate must be before toDate.");

    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) throw new Error("Schedule not found.");

    // Find all eligible trips in the window
    const trips = await Trip.find({
        scheduleId: schedule._id,
        tripDate: { $gte: start, $lte: end },
        status: { $nin: ["completed", "cancelled"] },
    });

    if (trips.length === 0) {
        return {
            tripsAffected: 0,
            bookingsReleased: 0,
            message: `No eligible trips found between ${start.toLocaleDateString()} and ${end.toLocaleDateString()}.`,
        };
    }

    let totalBookingsReleased = 0;

    for (const trip of trips) {
        trip.status             = "cancelled";
        trip.exceptionType      = "CANCELLED";
        trip.cancellationReason = reason;
        trip.cancelledBy        = adminId;
        trip.cancelledAt        = new Date();
        await trip.save();

        const result = await Booking.updateMany(
            { tripId: trip._id, status: { $in: ["booked", "pending"] } },
            { $set: {
                status: "cancelled",
                cancellationReason: `Date-range exception: ${reason}`,
            }}
        );
        totalBookingsReleased += result.modifiedCount;
    }

    logger.info("tripExceptionService: date-range exception applied", {
        scheduleId,
        fromDate: start,
        toDate: end,
        tripsAffected: trips.length,
        totalBookingsReleased,
        reason,
        adminId,
    });

    return {
        tripsAffected:    trips.length,
        bookingsReleased: totalBookingsReleased,
        fromDate:         start,
        toDate:           end,
        reason,
    };
};

// ─── 4. CREATE EXTRA RUN ──────────────────────────────────────────────────────
/**
 * Add a one-off trip on a specific date, outside the regular schedule.
 *
 * Use case: "Add an extra bus on June 15th for a festival / peak demand."
 * The trip is marked exceptionType = "EXTRA_RUN".
 * Uses the master schedule as its template for routing, pricing, and bus assignment.
 *
 * @param {string} scheduleId - The parent schedule to clone settings from
 * @param {Object} params     - { tripDate, departureTime?, arrivalTime?, notes? }
 * @param {string} adminId
 */
const createExtraRun = async (scheduleId, { tripDate, departureTime, arrivalTime, notes }, adminId) => {
    if (!tripDate) throw new Error("tripDate is required.");

    const runDate = new Date(tripDate);
    if (isNaN(runDate.getTime())) throw new Error("tripDate must be a valid date.");

    const schedule = await Schedule.findById(scheduleId);
    if (!schedule) throw new Error("Schedule not found.");
    if (schedule.status !== "ACTIVE") {
        throw new Error(`Only ACTIVE schedules can have extra runs. Schedule is ${schedule.status}.`);
    }

    const depTime = departureTime || schedule.departureTime;
    const arrTime = arrivalTime   || schedule.arrivalTime;

    // Check for duplicate trip on that date
    const existing = await Trip.findOne({
        scheduleId: schedule._id,
        tripDate: { $gte: new Date(runDate.setHours(0,0,0,0)), $lte: new Date(runDate.setHours(23,59,59,999)) },
        status: { $ne: "cancelled" },
    });
    if (existing) {
        throw new Error(`A trip already exists for this schedule on ${new Date(tripDate).toLocaleDateString()}. Cancel it first to create a replacement.`);
    }

    const [h, m] = depTime.split(":").map(Number);
    const depDateTime = new Date(new Date(tripDate).setHours(h, m, 0, 0));
    const cutoffHours = schedule.bookingCutoffHours ?? 2;
    const bookingClosesAt = new Date(depDateTime.getTime() - cutoffHours * 3600000);

    const tripIdStr = `EXTRA-${schedule.busId?.toString().slice(-4).toUpperCase()}-${new Date(tripDate).toISOString().split("T")[0].replace(/-/g, "")}`;

    const trip = new Trip({
        tripId:        tripIdStr,
        busId:         schedule.busId,
        variantId:     schedule.variantId,
        ownerId:       schedule.ownerId,
        brandId:       schedule.brandId,
        driverId:      schedule.driverId,
        seatTemplateId: schedule.seatTemplateId,
        scheduleId:    schedule._id,
        tripDate:      new Date(tripDate),
        departureTime: depTime,
        arrivalTime:   arrTime,
        tripFare:      schedule.fareOverride || null,
        bookingClosesAt,
        shift:         h < 12 ? "day" : "night",
        exceptionType: "EXTRA_RUN",
        isAutoGenerated: false,
        status:        "scheduled",
        recurrence:    "none",
    });

    await trip.save();

    logger.info("tripExceptionService: extra run created", {
        scheduleId,
        tripId: trip._id,
        tripDate,
        departureTime: depTime,
        adminId,
    });

    return { trip };
};

module.exports = {
    cancelTrip,
    rescheduleTrip,
    cancelDateRange,
    createExtraRun,
};
