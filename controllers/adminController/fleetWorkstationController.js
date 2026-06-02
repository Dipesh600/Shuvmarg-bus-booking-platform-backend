/**
 * controllers/adminController/fleetWorkstationController.js
 *
 * Powers the Fleet Profile Workstation — the central operational dashboard
 * for a single physical bus/fleet.
 *
 * Endpoints:
 *   GET  /admin/fleet/:id/workstation           → full profile payload
 *   GET  /admin/fleet/:id/trips/:tripId/manifest → per-trip passenger manifest
 *
 * Design principles:
 *   - Single API call populates the entire workstation (tabs select from the payload)
 *   - All aggregations use indexed fields (busId, tripDate, status)
 *   - Booking.busId is denormalized — no multi-collection joins for financials
 *   - Date ranges are UTC-bounded for idempotent results
 */

const mongoose = require("mongoose");
const Bus      = require("../../models/fleetModel");
const Trip     = require("../../models/tripModel");
const Booking  = require("../../models/bookTicketModel");
const Refund   = require("../../models/refundModel");
const Schedule = require("../../models/scheduleModel");
const DriverProfile = require("../../models/driverProfileModel");
const logger   = require("../../utils/logger");

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Build UTC start/end bounds for a date (or today) */
const dayBounds = (date) => {
    const d = date ? new Date(date) : new Date();
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
    const end   = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
    return { start, end };
};

/** Build UTC start of a month N months ago */
const monthStart = (monthsAgo = 0) => {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
    return d;
};

/**
 * Aggregate booking stats for a set of trip IDs.
 * Returns { booked, cancelled, noShow, revenue, discounts, occupancyPct }
 */
const aggregateBookingStats = async (tripIds, totalSeats) => {
    if (!tripIds.length) return null;

    const pipeline = [
        { $match: { tripId: { $in: tripIds } } },
        {
            $group: {
                _id: "$status",
                count: { $sum: 1 },
                seatCount: { $sum: { $size: "$seats" } },
                revenue: { $sum: "$totalAmount" },
                originalRevenue: { $sum: "$originalAmount" },
                discounts: { $sum: "$discountAmount" },
                boardedCount: {
                    $sum: { $cond: ["$boardingConfirmed", 1, 0] },
                },
            },
        },
    ];

    const results = await Booking.aggregate(pipeline);
    const stats = {
        totalBooked: 0,
        totalCancelled: 0,
        totalNoShow: 0,
        totalPending: 0,
        seatsSold: 0,
        boardingConfirmed: 0,
        revenue: 0,
        originalRevenue: 0,
        discounts: 0,
        occupancyPct: 0,
    };

    for (const r of results) {
        switch (r._id) {
            case "booked":
                stats.totalBooked = r.count;
                stats.seatsSold = r.seatCount;
                stats.revenue = r.revenue;
                stats.originalRevenue = r.originalRevenue;
                stats.discounts = r.discounts;
                stats.boardingConfirmed = r.boardedCount;
                break;
            case "cancelled":
                stats.totalCancelled = r.count;
                break;
            case "no_show":
                stats.totalNoShow = r.count;
                stats.revenue += r.revenue; // no-show fares are retained
                break;
            case "pending":
                stats.totalPending = r.count;
                break;
        }
    }

    if (totalSeats > 0) {
        stats.occupancyPct = Math.round((stats.seatsSold / totalSeats) * 1000) / 10;
    }

    return stats;
};

/**
 * Aggregate financial data for a bus across a date range.
 * Uses Booking.busId (denormalized) — no joins needed.
 */
const aggregateFinancials = async (busId, dateFrom, dateTo) => {
    const bookingMatch = {
        busId: new mongoose.Types.ObjectId(busId),
        status: { $in: ["booked", "no_show"] },
        createdAt: { $gte: dateFrom },
    };
    if (dateTo) bookingMatch.createdAt.$lt = dateTo;

    const [bookingAgg] = await Booking.aggregate([
        { $match: bookingMatch },
        {
            $group: {
                _id: null,
                gross: { $sum: "$totalAmount" },
                originalTotal: { $sum: "$originalAmount" },
                discountsGiven: { $sum: "$discountAmount" },
                bookingCount: { $sum: 1 },
                passengerCount: { $sum: { $size: "$seats" } },
            },
        },
    ]);

    // Refunds in the same window — find bookings for this bus, then their refunds
    const refundMatch = {
        busId: new mongoose.Types.ObjectId(busId),
        status: "cancelled",
        createdAt: { $gte: dateFrom },
    };
    if (dateTo) refundMatch.createdAt.$lt = dateTo;

    const cancelledBookingIds = await Booking.find(refundMatch)
        .select("_id")
        .lean()
        .then((docs) => docs.map((d) => d._id));

    let refundTotal = 0;
    let refundCount = 0;
    if (cancelledBookingIds.length > 0) {
        const [refundAgg] = await Refund.aggregate([
            {
                $match: {
                    bookingId: { $in: cancelledBookingIds },
                    status: { $in: ["completed", "processing"] },
                },
            },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$refundAmount" },
                    count: { $sum: 1 },
                },
            },
        ]);
        if (refundAgg) {
            refundTotal = refundAgg.total;
            refundCount = refundAgg.count;
        }
    }

    const gross = bookingAgg?.gross || 0;
    const commissionRate = 0; // Injected by caller from brand data

    return {
        gross,
        originalTotal: bookingAgg?.originalTotal || 0,
        discountsGiven: bookingAgg?.discountsGiven || 0,
        commission: 0, // Calculated by caller with brand.commissionRate
        refunds: refundTotal,
        refundCount,
        net: gross - refundTotal, // Commission subtracted by caller
        bookingCount: bookingAgg?.bookingCount || 0,
        passengerCount: bookingAgg?.passengerCount || 0,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/fleet/:id/workstation
// ─────────────────────────────────────────────────────────────────────────────
const getFleetWorkstation = async (req, res) => {
    try {
        const { id } = req.params;

        // ── 1. FLEET IDENTITY ────────────────────────────────────────────
        const fleet = await Bus.findById(id)
            .populate({
                path: "corridorId",
                select: "code originId destinationId",
                populate: [
                    { path: "originId", select: "name code" },
                    { path: "destinationId", select: "name code" },
                ],
            })
            .populate("brandId", "brandName commissionRate logo brandCode")
            .populate("ownerId", "name phone email")
            .populate("amenityIds", "name icon")
            .lean();

        if (!fleet) {
            return res.status(404).json({ success: false, message: "Fleet not found." });
        }

        const totalSeats = fleet.totalSeats || 0;
        const commissionRate = fleet.brandId?.commissionRate || 0;

        // ── 2. TODAY'S PULSE ─────────────────────────────────────────────
        const { start: todayStart, end: todayEnd } = dayBounds();

        const todayTrip = await Trip.findOne({
            busId: fleet._id,
            tripDate: { $gte: todayStart, $lte: todayEnd },
            status: { $ne: "cancelled" },
        })
            .populate("driverId", "fullName phone licenseNumber licenseType status")
            .populate({
                path: "variantId",
                select: "code name direction corridorId",
                populate: {
                    path: "corridorId",
                    select: "code originId destinationId",
                    populate: [
                        { path: "originId", select: "name" },
                        { path: "destinationId", select: "name" },
                    ],
                },
            })
            .populate("scheduleId", "departureTime arrivalTime operationalModel")
            .lean();

        let todayStats = null;
        if (todayTrip) {
            todayStats = await aggregateBookingStats([todayTrip._id], totalSeats);
        }

        // Next trip (if no trip today)
        let nextTrip = null;
        if (!todayTrip) {
            nextTrip = await Trip.findOne({
                busId: fleet._id,
                tripDate: { $gt: todayEnd },
                status: "scheduled",
            })
                .sort({ tripDate: 1 })
                .select("tripId tripDate departureTime arrivalTime shift")
                .populate({
                    path: "variantId",
                    select: "code direction",
                    populate: {
                        path: "corridorId",
                        select: "originId destinationId",
                        populate: [
                            { path: "originId", select: "name" },
                            { path: "destinationId", select: "name" },
                        ],
                    },
                })
                .lean();
        }

        // ── 3. ACTIVE SCHEDULES ──────────────────────────────────────────
        const schedules = await Schedule.find({
            busId: fleet._id,
            status: { $in: ["ACTIVE", "SUSPENDED", "DRAFT"] },
        })
            .populate("driverId", "fullName licenseNumber status")
            .populate({
                path: "variantId",
                select: "code name direction corridorId",
                populate: {
                    path: "corridorId",
                    select: "code originId destinationId",
                    populate: [
                        { path: "originId", select: "name" },
                        { path: "destinationId", select: "name" },
                    ],
                },
            })
            .sort({ status: 1, createdAt: -1 })
            .lean();

        // Enrich each schedule with trip count and next trip date
        for (const sched of schedules) {
            sched.tripCount = await Trip.countDocuments({ scheduleId: sched._id });
            const nextSchedTrip = await Trip.findOne({
                scheduleId: sched._id,
                tripDate: { $gt: todayEnd },
                status: "scheduled",
            })
                .sort({ tripDate: 1 })
                .select("tripDate")
                .lean();
            sched.nextTripDate = nextSchedTrip?.tripDate || null;
        }

        // ── 4. CATEGORIZED TRIPS ──────────────────────────────────────────
        // Separate buckets for each Operations Tab. Each gets booking stats.
        // "recentTrips" kept for backward-compat with Financial/Timeline tabs.

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
        const thirtyDaysAhead = new Date();
        thirtyDaysAhead.setUTCDate(thirtyDaysAhead.getUTCDate() + 30);
        const sixtyDaysAhead = new Date();
        sixtyDaysAhead.setUTCDate(sixtyDaysAhead.getUTCDate() + 60);

        const variantPopulate = {
            path: "variantId",
            select: "code direction",
            populate: {
                path: "corridorId",
                select: "originId destinationId",
                populate: [
                    { path: "originId", select: "name" },
                    { path: "destinationId", select: "name" },
                ],
            },
        };

        const [upcomingTrips, completedTrips, cancelledTrips, recentTrips] = await Promise.all([
            // UPCOMING — next 30 days, not cancelled
            Trip.find({
                busId: fleet._id,
                tripDate: { $gt: todayEnd, $lte: thirtyDaysAhead },
                status: { $ne: "cancelled" },
            })
                .populate("driverId", "fullName phone")
                .populate(variantPopulate)
                .sort({ tripDate: 1 })
                .lean(),

            // COMPLETED — last 30 days
            Trip.find({
                busId: fleet._id,
                tripDate: { $gte: thirtyDaysAgo, $lte: todayEnd },
                status: "completed",
            })
                .populate("driverId", "fullName phone")
                .populate(variantPopulate)
                .sort({ tripDate: -1 })
                .lean(),

            // CANCELLED — last 30 days
            Trip.find({
                busId: fleet._id,
                tripDate: { $gte: thirtyDaysAgo },
                status: "cancelled",
            })
                .populate("driverId", "fullName phone")
                .populate(variantPopulate)
                .sort({ tripDate: -1 })
                .lean(),

            // RECENT / ALL TRIPS — all statuses, last 60 days to next 30 days
            Trip.find({
                busId: fleet._id,
            })
                .populate("driverId", "fullName phone")
                .populate(variantPopulate)
                .sort({ tripDate: -1 })
                .limit(200)
                .lean(),
        ]);

        // One aggregation across all trip IDs — map per-trip below
        const allCategorizedIds = [
            ...upcomingTrips.map(t => t._id),
            ...completedTrips.map(t => t._id),
            ...cancelledTrips.map(t => t._id),
            ...recentTrips.map(t => t._id),
        ];

        const perTripStats = await Booking.aggregate([
            { $match: { tripId: { $in: allCategorizedIds } } },
            {
                $group: {
                    _id: { tripId: "$tripId", status: "$status" },
                    count: { $sum: 1 },
                    seatCount: { $sum: { $size: "$seats" } },
                    revenue: { $sum: "$totalAmount" },
                    boardedCount: { $sum: { $cond: ["$boardingConfirmed", 1, 0] } },
                    refundPending:   { $sum: { $cond: [{ $and: [{ $eq: ["$status", "cancelled"] }, { $eq: ["$refundId", null] }] }, 1, 0] } },
                },
            },
        ]);

        // Build stats map
        const tripStatsMap = {};
        for (const row of perTripStats) {
            const tid = row._id.tripId.toString();
            if (!tripStatsMap[tid]) {
                tripStatsMap[tid] = { booked: 0, cancelled: 0, noShow: 0, pending: 0, seatsSold: 0, revenue: 0, boardingConfirmed: 0, refundsPending: 0 };
            }
            const s = tripStatsMap[tid];
            switch (row._id.status) {
                case "booked":
                    s.booked = row.count; s.seatsSold = row.seatCount;
                    s.revenue = row.revenue; s.boardingConfirmed = row.boardedCount;
                    break;
                case "cancelled":
                    s.cancelled = row.count; s.refundsPending = row.refundPending; break;
                case "no_show":
                    s.noShow = row.count; s.revenue += row.revenue; break;
                case "pending":
                    s.pending = row.count; break;
            }
        }

        const attachStats = (trips) => {
            for (const trip of trips) {
                const s = tripStatsMap[trip._id.toString()] || { booked: 0, cancelled: 0, noShow: 0, pending: 0, seatsSold: 0, revenue: 0, boardingConfirmed: 0, refundsPending: 0 };
                trip.stats = { ...s, occupancyPct: totalSeats > 0 ? Math.round((s.seatsSold / totalSeats) * 1000) / 10 : 0 };
            }
        };

        attachStats(upcomingTrips);
        attachStats(completedTrips);
        attachStats(cancelledTrips);
        attachStats(recentTrips);

        // Lightweight trips for the Gantt timeline (next 60 days)
        const timelineTrips = await Trip.find({
            busId: fleet._id,
            tripDate: { $gt: todayEnd, $lte: sixtyDaysAhead },
        })
            .select("tripId tripDate departureTime arrivalTime status exceptionType scheduleId")
            .sort({ tripDate: 1 })
            .lean();



        // ── 5. FINANCIAL SUMMARY (3 windows) ─────────────────────────────
        const now = new Date();
        const thisMonthStart = monthStart(0);
        const lastMonthStart = monthStart(1);

        const [thisMonthRaw, lastMonthRaw, allTimeRaw] = await Promise.all([
            aggregateFinancials(id, thisMonthStart, null),
            aggregateFinancials(id, lastMonthStart, thisMonthStart),
            aggregateFinancials(id, new Date("2020-01-01"), null),
        ]);

        // Apply commission rate
        const applyCommission = (data) => {
            data.commission = Math.round(data.gross * (commissionRate / 100));
            data.net = data.gross - data.commission - data.refunds;
            return data;
        };

        const financials = {
            commissionRate,
            thisMonth: applyCommission(thisMonthRaw),
            lastMonth: applyCommission(lastMonthRaw),
            allTime: applyCommission(allTimeRaw),
        };

        // ── 6. CREW (lightweight — for header display) ───────────────────
        const assignedDriver = await DriverProfile.findOne({
            assignedBusId: fleet._id,
            approvalStatus: "APPROVED",
        })
            .select("fullName phone licenseNumber licenseType status documents.license.validTill documents.medical.validTill")
            .lean();

        // ── RESPONSE ─────────────────────────────────────────────────────
        return res.status(200).json({
            success: true,
            data: {
                fleet,
                today: {
                    trip: todayTrip,
                    stats: todayStats,
                    nextTrip,
                },
                schedules,
                recentTrips,
                upcomingTrips,
                completedTrips,
                cancelledTrips,
                timelineTrips,
                financials,
                crew: {
                    assignedDriver,
                },
            },
        });
    } catch (err) {
        logger.error("fleetWorkstationController: getFleetWorkstation error", {
            error: err.message,
            stack: err.stack,
        });
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/fleet/:fleetId/trips/:tripId/manifest
// ─────────────────────────────────────────────────────────────────────────────

const getTripManifest = async (req, res) => {
    try {
        const { fleetId, tripId } = req.params;

        // Verify the trip belongs to this fleet (prevents cross-fleet access)
        const trip = await Trip.findOne({ _id: tripId, busId: fleetId })
            .select("tripId tripDate departureTime arrivalTime status shift")
            .populate("driverId", "fullName phone licenseNumber")
            .populate({
                path: "variantId",
                select: "code direction",
                populate: {
                    path: "corridorId",
                    select: "originId destinationId",
                    populate: [
                        { path: "originId", select: "name" },
                        { path: "destinationId", select: "name" },
                    ],
                },
            })
            .lean();

        if (!trip) {
            return res.status(404).json({
                success: false,
                message: "Trip not found or does not belong to this fleet.",
            });
        }

        // Get all bookings for this trip with full passenger detail
        const bookings = await Booking.find({ tripId: trip._id })
            .populate("userId", "name phone email")
            .populate("refundId", "refundAmount status processedAt")
            .sort({ bookedAt: 1 })
            .lean();

        // Summary stats
        const summary = {
            totalBookings: bookings.length,
            totalPassengers: bookings.reduce((acc, b) => acc + (b.passengerDetails?.length || b.seats?.length || 0), 0),
            totalRevenue: 0,
            boardedCount: 0,
            cancelledCount: 0,
            noShowCount: 0,
            refundedAmount: 0,
        };

        for (const b of bookings) {
            switch (b.status) {
                case "booked":
                    summary.totalRevenue += b.totalAmount;
                    if (b.boardingConfirmed) summary.boardedCount++;
                    break;
                case "cancelled":
                    summary.cancelledCount++;
                    if (b.refundId) summary.refundedAmount += b.refundId.refundAmount || 0;
                    break;
                case "no_show":
                    summary.noShowCount++;
                    summary.totalRevenue += b.totalAmount; // retained
                    break;
            }
        }

        return res.status(200).json({
            success: true,
            data: { trip, bookings, summary },
        });
    } catch (err) {
        logger.error("fleetWorkstationController: getTripManifest error", {
            error: err.message,
            stack: err.stack,
        });
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /admin/fleet/:fleetId/trips/:tripId/status
// ─────────────────────────────────────────────────────────────────────────────
const updateTripStatus = async (req, res) => {
    try {
        const { fleetId, tripId } = req.params;
        const { status, cancellationReason } = req.body;
        const adminId = req.user.id;

        const trip = await Trip.findOne({ _id: tripId, busId: fleetId });
        if (!trip) {
            return res.status(404).json({ success: false, message: "Trip not found." });
        }

        const validTransitions = {
            scheduled: ["boarding", "cancelled"],
            boarding: ["in-transit", "cancelled"],
            "in-transit": ["completed"],
            completed: [],
            cancelled: []
        };

        if (!validTransitions[trip.status]?.includes(status)) {
            return res.status(400).json({ success: false, message: `Invalid transition from ${trip.status} to ${status}` });
        }

        if (status === "in-transit") {
            trip.actualDepartureTime = new Date();
        } else if (status === "completed") {
            trip.actualArrivalTime = new Date();
        } else if (status === "cancelled") {
            trip.cancelledBy = adminId;
            trip.cancellationReason = cancellationReason || "Cancelled by admin via Workstation";
            
            // Cascade to bookings -> trigger refunds
            const activeBookings = await Booking.find({ tripId: trip._id, status: "booked" });
            
            const refundPromises = activeBookings.map(async (booking) => {
                const newRefund = new Refund({
                    userId: booking.userId,
                    bookingId: booking._id,
                    transactionId: booking.transactionId,
                    originalAmount: booking.originalAmount,
                    refundAmount: booking.totalAmount, // full refund for admin cancel
                    reason: "Trip Cancelled by Operator",
                    status: "pending"
                });
                await newRefund.save();
                
                booking.status = "cancelled";
                booking.refundId = newRefund._id;
                await booking.save();
            });
            await Promise.all(refundPromises);
        }

        trip.status = status;
        await trip.save();

        // ── REFERRAL V2: Progressive Unlock on Trip Completion ────────────
        // Spec §3.1: Trigger is journey.status = COMPLETED.
        // For each non-cancelled booking on this trip, check if the booking
        // user was referred — if so, process the referral unlock.
        // Fire-and-forget: referral processing failure must NOT block
        // the trip completion response.
        if (status === "completed") {
            try {
                const referralV2Service = require("../../services/referralV2Service");
                const User = require("../../models/userModel");

                const completedBookings = await Booking.find({
                    tripId: trip._id,
                    status: "booked", // Only non-cancelled bookings
                }).select("_id userId totalAmount").lean();

                for (const booking of completedBookings) {
                    try {
                        // Quick check: does this user have a referredBy?
                        const user = await User.findById(booking.userId)
                            .select("referredBy")
                            .lean();

                        if (user && user.referredBy) {
                            const result = await referralV2Service.processJourneyCompletion(
                                booking.userId,
                                booking._id
                            );
                            if (result) {
                                logger.info("Referral unlock processed", {
                                    referredUserId: booking.userId,
                                    bookingId: booking._id,
                                    journeyNumber: result.journeyNumber,
                                    amountUnlocked: result.amountUnlocked,
                                });
                            }
                        }
                    } catch (refErr) {
                        // Non-blocking: log and continue to next booking
                        logger.error("Referral unlock failed for booking (non-blocking)", {
                            bookingId: booking._id,
                            userId: booking.userId,
                            error: refErr.message,
                        });
                    }
                }
            } catch (batchErr) {
                logger.error("Referral unlock batch failed (non-blocking)", {
                    tripId: trip._id,
                    error: batchErr.message,
                });
            }
        }

        return res.status(200).json({
            success: true,
            message: `Trip status updated to ${status}`,
            data: trip
        });

    } catch (err) {
        logger.error("fleetWorkstationController: updateTripStatus error", { error: err.message });
        return res.status(500).json({ success: false, message: err.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /admin/fleet/:fleetId/trips/:tripId/driver
// ─────────────────────────────────────────────────────────────────────────────
const reassignTripDriver = async (req, res) => {
    try {
        const { fleetId, tripId } = req.params;
        const { driverId, reason } = req.body;
        const adminId = req.user.id;

        const trip = await Trip.findOne({ _id: tripId, busId: fleetId });
        if (!trip) {
            return res.status(404).json({ success: false, message: "Trip not found." });
        }

        const newDriver = await DriverProfile.findOne({ _id: driverId, brandId: trip.brandId });
        if (!newDriver) {
             return res.status(400).json({ success: false, message: "Driver not found or doesn't belong to this brand." });
        }

        trip.driverAssignmentLog.push({
            driverId: newDriver._id,
            assignedAt: new Date(),
            assignedBy: adminId,
            reason: reason || "Manual reassignment via Workstation"
        });

        trip.driverId = newDriver._id;
        await trip.save();

        return res.status(200).json({
            success: true,
            message: "Driver reassigned successfully",
            data: trip
        });

    } catch (err) {
        logger.error("fleetWorkstationController: reassignTripDriver error", { error: err.message });
        return res.status(500).json({ success: false, message: err.message });
    }
};

module.exports = {
    getFleetWorkstation,
    getTripManifest,
    updateTripStatus,
    reassignTripDriver,
};
