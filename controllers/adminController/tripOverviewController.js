/**
 * controllers/adminController/tripOverviewController.js
 *
 * Powers the Trip Control Center in the Super Admin panel.
 * Three read-only endpoints for platform-wide oversight:
 *
 *   GET /admin/trips/overview       → Exception triage + KPI aggregation
 *   GET /admin/trips/schedule-health → CRON generation health per schedule
 *   GET /admin/trips/search         → Enhanced global trip search with stats
 *
 * Security:
 *   - All endpoints are behind adminMiddleware (JWT + role + active check)
 *   - All queries use indexed fields (status, brandId, tripDate, scheduleId)
 *   - No mutations — this is a pure observation layer
 *   - ObjectId validation on all param/query inputs
 */

const mongoose = require("mongoose");
const Trip     = require("../../models/tripModel");
const Booking  = require("../../models/bookTicketModel");
const Refund   = require("../../models/refundModel");
const Schedule = require("../../models/scheduleModel");
const logger   = require("../../utils/logger");

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Validate a string is a valid Mongo ObjectId */
const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

/** UTC day bounds for a date */
const dayBounds = (date) => {
    const d = date ? new Date(date) : new Date();
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
    const end   = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
    return { start, end };
};

/**
 * Aggregate booking stats for a set of trip IDs.
 * Returns a map: tripId → { booked, cancelled, noShow, seatsSold, revenue, refundsPending }
 */
const aggregateBookingStatsMap = async (tripIds) => {
    if (!tripIds.length) return {};

    const results = await Booking.aggregate([
        { $match: { tripId: { $in: tripIds } } },
        {
            $group: {
                _id: { tripId: "$tripId", status: "$status" },
                count:       { $sum: 1 },
                seatCount:   { $sum: { $size: "$seats" } },
                revenue:     { $sum: "$totalAmount" },
                boardedCount: { $sum: { $cond: ["$boardingConfirmed", 1, 0] } },
            },
        },
    ]);

    const map = {};
    for (const row of results) {
        const tid = row._id.tripId.toString();
        if (!map[tid]) {
            map[tid] = {
                booked: 0, cancelled: 0, noShow: 0, pending: 0,
                seatsSold: 0, revenue: 0, boardingConfirmed: 0,
            };
        }
        const s = map[tid];
        switch (row._id.status) {
            case "booked":
                s.booked = row.count;
                s.seatsSold = row.seatCount;
                s.revenue = row.revenue;
                s.boardingConfirmed = row.boardedCount;
                break;
            case "cancelled":
                s.cancelled = row.count;
                break;
            case "no_show":
                s.noShow = row.count;
                s.revenue += row.revenue;
                break;
            case "pending":
                s.pending = row.count;
                break;
        }
    }
    return map;
};

/**
 * Count pending refunds for a set of trip IDs.
 * Returns a map: tripId → { pendingCount, pendingAmount }
 */
const aggregateRefundStatsMap = async (tripIds) => {
    if (!tripIds.length) return {};

    // Find all cancelled bookings for these trips
    const cancelledBookings = await Booking.find({
        tripId: { $in: tripIds },
        status: "cancelled",
    }).select("_id tripId").lean();

    if (!cancelledBookings.length) return {};

    const bookingIds = cancelledBookings.map(b => b._id);
    const bookingTripMap = {};
    for (const b of cancelledBookings) {
        bookingTripMap[b._id.toString()] = b.tripId.toString();
    }

    const refunds = await Refund.find({
        bookingId: { $in: bookingIds },
        status: "pending",
    }).select("bookingId refundAmount").lean();

    const map = {};
    for (const r of refunds) {
        const tid = bookingTripMap[r.bookingId.toString()];
        if (!tid) continue;
        if (!map[tid]) map[tid] = { pendingCount: 0, pendingAmount: 0 };
        map[tid].pendingCount++;
        map[tid].pendingAmount += r.refundAmount || 0;
    }
    return map;
};


// ─── GET /admin/trips/overview ────────────────────────────────────────────────
/**
 * Exception Triage Dashboard — returns:
 *   1. KPI cards: total exceptions, revenue at risk, stuck trips, pending refunds
 *   2. Exception trips with per-trip booking stats
 *
 * Query params:
 *   - brandId (optional): filter by brand
 *   - from (optional): start date, default 7 days ago
 *   - to (optional): end date, default 7 days ahead
 *   - page, limit: pagination
 */
const getOverview = async (req, res) => {
    try {
        const page   = Math.max(1, parseInt(req.query.page) || 1);
        const limit  = Math.min(100, parseInt(req.query.limit) || 30);
        const skip   = (page - 1) * limit;

        // Date window
        const now = new Date();
        const defaultFrom = new Date(now);
        defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 7);
        const defaultTo = new Date(now);
        defaultTo.setUTCDate(defaultTo.getUTCDate() + 7);

        const from = req.query.from ? new Date(req.query.from) : defaultFrom;
        const to   = req.query.to   ? new Date(req.query.to)   : defaultTo;
        from.setUTCHours(0, 0, 0, 0);
        to.setUTCHours(23, 59, 59, 999);

        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
            return res.status(400).json({ success: false, message: "Invalid date format." });
        }

        // Brand filter
        const brandFilter = req.query.brandId && isValidId(req.query.brandId)
            ? { brandId: new mongoose.Types.ObjectId(req.query.brandId) }
            : {};

        // ── 1. Exception trips (cancelled, rescheduled, extra_run) ──────────
        const exceptionQuery = {
            ...brandFilter,
            tripDate: { $gte: from, $lte: to },
            $or: [
                { exceptionType: { $in: ["CANCELLED", "RESCHEDULED", "EXTRA_RUN"] } },
                { status: "cancelled" },
            ],
        };

        const [exceptionTrips, exceptionCount] = await Promise.all([
            Trip.find(exceptionQuery)
                .sort({ tripDate: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("brandId", "brandName brandCode logo")
                .populate("busId", "busNumber busName")
                .populate("ownerId", "name email")
                .populate("driverId", "fullName phone")
                .populate({
                    path: "variantId",
                    select: "name direction",
                    populate: {
                        path: "corridorId",
                        select: "originCity destinationCity",
                        populate: [
                            { path: "originId", select: "name" },
                            { path: "destinationId", select: "name" },
                        ],
                    },
                })
                .lean(),
            Trip.countDocuments(exceptionQuery),
        ]);

        // Attach per-trip booking stats
        const exceptionIds = exceptionTrips.map(t => t._id);
        const [bookingStatsMap, refundStatsMap] = await Promise.all([
            aggregateBookingStatsMap(exceptionIds),
            aggregateRefundStatsMap(exceptionIds),
        ]);

        for (const trip of exceptionTrips) {
            const tid = trip._id.toString();
            trip.bookingStats = bookingStatsMap[tid] || {
                booked: 0, cancelled: 0, noShow: 0, pending: 0,
                seatsSold: 0, revenue: 0, boardingConfirmed: 0,
            };
            trip.refundStats = refundStatsMap[tid] || { pendingCount: 0, pendingAmount: 0 };
        }

        // ── 2. Stuck trips (boarding > 3hrs past departure, or in-transit > 24hrs) ──
        const threeHoursAgo  = new Date(now.getTime() - 3 * 3600000);
        const twentyFourHAgo = new Date(now.getTime() - 24 * 3600000);

        const stuckTrips = await Trip.find({
            ...brandFilter,
            $or: [
                // Boarding but departure time is > 3 hours ago
                { status: "boarding", tripDate: { $lte: threeHoursAgo } },
                // In transit for > 24 hours
                { status: "in-transit", actualDepartureTime: { $lte: twentyFourHAgo } },
            ],
        })
            .populate("brandId", "brandName brandCode")
            .populate("busId", "busNumber busName")
            .select("tripId tripDate departureTime arrivalTime status brandId busId directionLabel fromStopName toStopName")
            .lean();

        // ── 3. KPI aggregation ──────────────────────────────────────────────
        const { start: todayStart, end: todayEnd } = dayBounds();

        const [
            todayExceptionCount,
            totalRevenueAtRisk,
            totalPendingRefunds,
        ] = await Promise.all([
            // Today's exceptions
            Trip.countDocuments({
                ...brandFilter,
                tripDate: { $gte: todayStart, $lte: todayEnd },
                $or: [
                    { exceptionType: { $in: ["CANCELLED", "RESCHEDULED", "EXTRA_RUN"] } },
                    { status: "cancelled" },
                ],
            }),

            // Revenue at risk: sum of booking amounts on cancelled trips in window
            (async () => {
                const cancelledTripIds = await Trip.find({
                    ...brandFilter,
                    tripDate: { $gte: from, $lte: to },
                    status: "cancelled",
                }).select("_id").lean().then(docs => docs.map(d => d._id));

                if (!cancelledTripIds.length) return 0;
                const [agg] = await Booking.aggregate([
                    { $match: { tripId: { $in: cancelledTripIds }, status: "cancelled" } },
                    { $group: { _id: null, total: { $sum: "$totalAmount" } } },
                ]);
                return agg?.total || 0;
            })(),

            // Pending refunds (platform-wide, not windowed)
            Refund.countDocuments({ status: "pending" }),
        ]);

        return res.status(200).json({
            success: true,
            data: {
                kpis: {
                    todayExceptions: todayExceptionCount,
                    totalExceptions: exceptionCount,
                    revenueAtRisk: totalRevenueAtRisk,
                    stuckTrips: stuckTrips.length,
                    pendingRefunds: totalPendingRefunds,
                },
                exceptions: {
                    trips: exceptionTrips,
                    pagination: {
                        total: exceptionCount,
                        page,
                        limit,
                        totalPages: Math.ceil(exceptionCount / limit),
                    },
                },
                stuckTrips,
            },
        });

    } catch (err) {
        logger.error("tripOverviewController: getOverview error", {
            error: err.message,
            stack: err.stack,
        });
        return res.status(500).json({ success: false, message: err.message });
    }
};


// ─── GET /admin/trips/schedule-health ─────────────────────────────────────────
/**
 * Schedule Health Monitor — for every ACTIVE schedule, checks if the CRON
 * has generated trips far enough into the future.
 *
 * Returns:
 *   - Each active schedule with: expected horizon, actual horizon, gap flag
 *   - Suspended schedules as a separate "warnings" list
 *
 * Query params:
 *   - brandId (optional): filter by brand
 */
const getScheduleHealth = async (req, res) => {
    try {
        const brandFilter = req.query.brandId && isValidId(req.query.brandId)
            ? { brandId: new mongoose.Types.ObjectId(req.query.brandId) }
            : {};

        const now = new Date();
        const { start: todayStart, end: todayEnd } = dayBounds();

        // Fetch all active + suspended schedules
        const schedules = await Schedule.find({
            ...brandFilter,
            status: { $in: ["ACTIVE", "SUSPENDED"] },
        })
            .populate("brandId", "brandName brandCode logo")
            .populate("busId", "busNumber busName")
            .populate("driverId", "fullName status")
            .populate({
                path: "variantId",
                select: "code name direction",
                populate: {
                    path: "corridorId",
                    select: "originCity destinationCity",
                    populate: [
                        { path: "originId", select: "name" },
                        { path: "destinationId", select: "name" },
                    ],
                },
            })
            .sort({ status: 1, "brandId.brandName": 1 })
            .lean();

        // For each schedule, find the farthest-out trip and compare to expected horizon
        const healthData = [];
        const warnings   = [];

        for (const sched of schedules) {
            // Expected: today + advanceGenerationDays
            const windowDays    = sched.advanceGenerationDays || 60;
            const expectedDate  = new Date(now);
            expectedDate.setUTCDate(expectedDate.getUTCDate() + windowDays);

            // Actual: farthest trip date
            const farthestTrip = await Trip.findOne({
                scheduleId: sched._id,
                status: { $ne: "cancelled" },
            })
                .sort({ tripDate: -1 })
                .select("tripDate tripId")
                .lean();

            // Trip count (last 30 days + upcoming)
            const thirtyDaysAgo = new Date(now);
            thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

            const [totalTrips, upcomingTrips, cancelledTrips] = await Promise.all([
                Trip.countDocuments({ scheduleId: sched._id }),
                Trip.countDocuments({
                    scheduleId: sched._id,
                    tripDate: { $gt: todayEnd },
                    status: "scheduled",
                }),
                Trip.countDocuments({
                    scheduleId: sched._id,
                    tripDate: { $gte: thirtyDaysAgo },
                    status: "cancelled",
                }),
            ]);

            const actualHorizon = farthestTrip?.tripDate || null;
            const gapDays = actualHorizon
                ? Math.round((expectedDate.getTime() - new Date(actualHorizon).getTime()) / 86400000)
                : windowDays;

            const entry = {
                schedule: sched,
                health: {
                    expectedHorizon: expectedDate,
                    actualHorizon,
                    gapDays:  Math.max(0, gapDays),
                    hasGap:   gapDays > 3, // flag if more than 3 days short
                    status:   gapDays > 7 ? "CRITICAL" : gapDays > 3 ? "WARNING" : "HEALTHY",
                    totalTrips,
                    upcomingTrips,
                    cancelledTrips,
                },
            };

            if (sched.status === "SUSPENDED") {
                warnings.push(entry);
            } else {
                healthData.push(entry);
            }
        }

        // Sort: CRITICAL first, then WARNING, then HEALTHY
        const statusOrder = { CRITICAL: 0, WARNING: 1, HEALTHY: 2 };
        healthData.sort((a, b) =>
            (statusOrder[a.health.status] ?? 9) - (statusOrder[b.health.status] ?? 9)
        );

        // Summary KPIs
        const kpis = {
            totalActive:    healthData.length,
            totalSuspended: warnings.length,
            critical:       healthData.filter(h => h.health.status === "CRITICAL").length,
            warnings:       healthData.filter(h => h.health.status === "WARNING").length,
            healthy:        healthData.filter(h => h.health.status === "HEALTHY").length,
        };

        return res.status(200).json({
            success: true,
            data: {
                kpis,
                schedules: healthData,
                suspended: warnings,
            },
        });

    } catch (err) {
        logger.error("tripOverviewController: getScheduleHealth error", {
            error: err.message,
            stack: err.stack,
        });
        return res.status(500).json({ success: false, message: err.message });
    }
};


// ─── GET /admin/trips/search ──────────────────────────────────────────────────
/**
 * Enhanced Global Trip Search — upgraded getAllTrips with booking stats.
 *
 * Query params:
 *   - page, limit: pagination
 *   - status: trip status filter
 *   - date: YYYY-MM-DD exact date filter
 *   - from, to: date range filter
 *   - brandId: brand filter
 *   - search: searches tripId, bus number, direction label
 */
const searchTrips = async (req, res) => {
    try {
        const page   = Math.max(1, parseInt(req.query.page) || 1);
        const limit  = Math.min(100, parseInt(req.query.limit) || 30);
        const skip   = (page - 1) * limit;

        const query = {};

        // Status filter
        if (req.query.status && req.query.status !== "all") {
            query.status = req.query.status;
        }

        // Exact date
        if (req.query.date) {
            const d = new Date(req.query.date);
            if (!isNaN(d.getTime())) {
                const next = new Date(d);
                next.setDate(next.getDate() + 1);
                query.tripDate = { $gte: d, $lt: next };
            }
        }

        // Date range (overrides exact date)
        if (req.query.from || req.query.to) {
            query.tripDate = {};
            if (req.query.from) {
                const f = new Date(req.query.from);
                if (!isNaN(f.getTime())) {
                    f.setUTCHours(0, 0, 0, 0);
                    query.tripDate.$gte = f;
                }
            }
            if (req.query.to) {
                const t = new Date(req.query.to);
                if (!isNaN(t.getTime())) {
                    t.setUTCHours(23, 59, 59, 999);
                    query.tripDate.$lte = t;
                }
            }
        }

        // Brand filter
        if (req.query.brandId && isValidId(req.query.brandId)) {
            query.brandId = new mongoose.Types.ObjectId(req.query.brandId);
        }

        // Text search on tripId, directionLabel
        if (req.query.search) {
            const s = req.query.search.trim();
            if (s) {
                query.$or = [
                    { tripId: { $regex: s, $options: "i" } },
                    { directionLabel: { $regex: s, $options: "i" } },
                    { fromStopName: { $regex: s, $options: "i" } },
                    { toStopName: { $regex: s, $options: "i" } },
                ];
            }
        }

        const [trips, total] = await Promise.all([
            Trip.find(query)
                .sort({ tripDate: -1, createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("brandId", "brandName brandCode")
                .populate("busId", "busNumber busName totalSeats")
                .populate("ownerId", "name email")
                .populate("driverId", "fullName phone")
                .populate("scheduleId", "departureTime recurrence versionNumber")
                .populate({
                    path: "variantId",
                    select: "name direction",
                    populate: {
                        path: "corridorId",
                        select: "originCity destinationCity",
                        populate: [
                            { path: "originId", select: "name" },
                            { path: "destinationId", select: "name" },
                        ],
                    },
                })
                .lean(),
            Trip.countDocuments(query),
        ]);

        // Attach per-trip booking stats
        const tripIds = trips.map(t => t._id);
        const bookingStatsMap = await aggregateBookingStatsMap(tripIds);

        for (const trip of trips) {
            const tid = trip._id.toString();
            trip.bookingStats = bookingStatsMap[tid] || {
                booked: 0, cancelled: 0, noShow: 0, pending: 0,
                seatsSold: 0, revenue: 0, boardingConfirmed: 0,
            };
        }

        return res.status(200).json({
            success: true,
            data: {
                trips,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                },
            },
        });

    } catch (err) {
        logger.error("tripOverviewController: searchTrips error", {
            error: err.message,
            stack: err.stack,
        });
        return res.status(500).json({ success: false, message: err.message });
    }
};


// ─── GET /admin/trips/route-performance ───────────────────────────────────────
/**
 * Route Performance — industry-standard metrics per schedule.
 *
 * For every ACTIVE schedule (optionally filtered by brand), returns:
 *   - Load Factor: average seats sold / total seats per trip (%)
 *   - Revenue: total booking revenue across all trips in window
 *   - Trip Completion Rate: (completed trips / total non-cancelled trips) (%)
 *   - Cancellation Rate: cancelled trips / total trips (%)
 *   - Revenue per trip: average
 *
 * Window: configurable, default last 30 days.
 * Sort: worst load factor first (lowest occupancy = biggest business problem).
 *
 * Query params:
 *   - brandId (optional)
 *   - days (optional, default 30): rolling window in days
 */
const getRoutePerformance = async (req, res) => {
    try {
        const brandFilter = req.query.brandId && isValidId(req.query.brandId)
            ? { brandId: new mongoose.Types.ObjectId(req.query.brandId) }
            : {};

        const windowDays = Math.min(365, Math.max(7, parseInt(req.query.days) || 30));
        const now = new Date();
        const windowStart = new Date(now);
        windowStart.setUTCDate(windowStart.getUTCDate() - windowDays);
        windowStart.setUTCHours(0, 0, 0, 0);

        // ── 1. All ACTIVE schedules ────────────────────────────────────────
        const schedules = await Schedule.find({
            ...brandFilter,
            status: { $in: ["ACTIVE", "SUSPENDED"] },
        })
            .populate("brandId", "brandName brandCode logo")
            .populate("busId", "busNumber busName totalSeats")
            .populate({
                path: "variantId",
                select: "name direction",
                populate: {
                    path: "corridorId",
                    select: "originCity destinationCity",
                    populate: [
                        { path: "originId", select: "name" },
                        { path: "destinationId", select: "name" },
                    ],
                },
            })
            .lean();

        if (!schedules.length) {
            return res.status(200).json({
                success: true,
                data: { routes: [], kpis: { avgLoadFactor: 0, avgCompletionRate: 0, topRevenue: 0, bottomPerformer: null }, windowDays },
            });
        }

        const scheduleIds = schedules.map(s => s._id);

        // ── 2. Trip-level aggregation per schedule in window ───────────────
        const tripAgg = await Trip.aggregate([
            {
                $match: {
                    scheduleId: { $in: scheduleIds },
                    tripDate: { $gte: windowStart, $lte: now },
                },
            },
            {
                $group: {
                    _id: "$scheduleId",
                    totalTrips:     { $sum: 1 },
                    completedTrips: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                    cancelledTrips: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
                    inTransitTrips: { $sum: { $cond: [{ $eq: ["$status", "in-transit"] }, 1, 0] } },
                    scheduledTrips: { $sum: { $cond: [{ $eq: ["$status", "scheduled"] }, 1, 0] } },
                    boardingTrips:  { $sum: { $cond: [{ $eq: ["$status", "boarding"] }, 1, 0] } },
                    tripIds:        { $push: "$_id" },
                },
            },
        ]);

        // Map scheduleId → trip stats
        const tripStatsMap = {};
        const allTripIds = [];
        for (const row of tripAgg) {
            tripStatsMap[row._id.toString()] = row;
            allTripIds.push(...row.tripIds);
        }

        // ── 3. Booking aggregation per trip (seats sold + revenue) ─────────
        const bookingAgg = await Booking.aggregate([
            {
                $match: {
                    tripId: { $in: allTripIds },
                    status: { $in: ["booked", "no_show"] }, // confirmed revenue only
                },
            },
            {
                $group: {
                    _id: "$tripId",
                    seatsSold: { $sum: { $size: "$seats" } },
                    revenue:   { $sum: "$totalAmount" },
                    bookings:  { $sum: 1 },
                },
            },
        ]);

        // Map tripId → booking stats
        const bookingMap = {};
        for (const row of bookingAgg) {
            bookingMap[row._id.toString()] = row;
        }

        // ── 4. Merge: per-schedule booking roll-up ─────────────────────────
        // For each schedule, sum booking stats across all its trips in window
        const scheduleBookingMap = {};
        for (const schedId in tripStatsMap) {
            const tripIds = tripStatsMap[schedId].tripIds || [];
            let totalSeats = 0, totalRevenue = 0, totalBookings = 0;
            for (const tid of tripIds) {
                const bk = bookingMap[tid.toString()];
                if (bk) {
                    totalSeats    += bk.seatsSold;
                    totalRevenue  += bk.revenue;
                    totalBookings += bk.bookings;
                }
            }
            scheduleBookingMap[schedId] = { totalSeats, totalRevenue, totalBookings };
        }

        // ── 5. Compose per-route result ────────────────────────────────────
        const routes = schedules.map(sched => {
            const sid    = sched._id.toString();
            const tStats = tripStatsMap[sid];
            const bStats = scheduleBookingMap[sid];
            const busSeats = sched.busId?.totalSeats || 0;

            if (!tStats) {
                // No trips ran in this window
                return {
                    schedule: sched,
                    metrics: {
                        windowDays,
                        totalTrips: 0,
                        completedTrips: 0,
                        cancelledTrips: 0,
                        runTrips: 0, // completed + in-transit + boarding
                        completionRate: null, // null = no data
                        cancellationRate: null,
                        totalSeatsSold: 0,
                        totalRevenue: 0,
                        avgRevenuePerTrip: 0,
                        loadFactor: null, // null = no data
                        busSeats,
                        performance: "NO_DATA",
                    },
                };
            }

            const runTrips = tStats.completedTrips + tStats.inTransitTrips + tStats.boardingTrips;
            const nonCancelled = tStats.totalTrips - tStats.cancelledTrips;

            const completionRate = nonCancelled > 0
                ? Math.round((runTrips / nonCancelled) * 100)
                : null;

            const cancellationRate = tStats.totalTrips > 0
                ? Math.round((tStats.cancelledTrips / tStats.totalTrips) * 100)
                : 0;

            // Load factor: seats sold / (completed trips × bus capacity)
            // Only count completed trips for denominator — in-progress ones aren't finalized
            const capacityRan = tStats.completedTrips * busSeats;
            const loadFactor = capacityRan > 0
                ? Math.round(((bStats?.totalSeats || 0) / capacityRan) * 100)
                : null;

            const avgRevenuePerTrip = runTrips > 0
                ? Math.round((bStats?.totalRevenue || 0) / runTrips)
                : 0;

            // Performance tier: industry standard thresholds
            let performance = "HEALTHY";
            if (loadFactor !== null && loadFactor < 30) performance = "CRITICAL"; // below 30% = losing money
            else if (cancellationRate > 20)             performance = "CRITICAL"; // >20% cancel rate
            else if (loadFactor !== null && loadFactor < 55) performance = "LOW";    // 30-54%
            else if (cancellationRate > 10)             performance = "LOW";
            else if (loadFactor !== null && loadFactor < 70) performance = "MODERATE"; // 55-69%

            return {
                schedule: sched,
                metrics: {
                    windowDays,
                    totalTrips:        tStats.totalTrips,
                    completedTrips:    tStats.completedTrips,
                    cancelledTrips:    tStats.cancelledTrips,
                    runTrips,
                    completionRate,
                    cancellationRate,
                    totalSeatsSold:    bStats?.totalSeats || 0,
                    totalRevenue:      bStats?.totalRevenue || 0,
                    avgRevenuePerTrip,
                    loadFactor,
                    busSeats,
                    performance,
                },
            };
        });

        // Sort: CRITICAL first, then LOW, MODERATE, HEALTHY, NO_DATA last
        const perfOrder = { CRITICAL: 0, LOW: 1, MODERATE: 2, HEALTHY: 3, NO_DATA: 4 };
        routes.sort((a, b) =>
            (perfOrder[a.metrics.performance] ?? 9) - (perfOrder[b.metrics.performance] ?? 9)
        );

        // ── 6. Platform-level KPIs ─────────────────────────────────────────
        const withData = routes.filter(r => r.metrics.loadFactor !== null);
        const avgLoadFactor = withData.length > 0
            ? Math.round(withData.reduce((s, r) => s + (r.metrics.loadFactor || 0), 0) / withData.length)
            : 0;

        const avgCompletionRate = routes.filter(r => r.metrics.completionRate !== null).length > 0
            ? Math.round(routes.filter(r => r.metrics.completionRate !== null)
                .reduce((s, r) => s + (r.metrics.completionRate || 0), 0) /
                routes.filter(r => r.metrics.completionRate !== null).length)
            : 0;

        const topRevenue = routes.reduce((max, r) =>
            r.metrics.totalRevenue > max ? r.metrics.totalRevenue : max, 0);

        const critical = routes.filter(r => r.metrics.performance === "CRITICAL").length;
        const low      = routes.filter(r => r.metrics.performance === "LOW").length;

        return res.status(200).json({
            success: true,
            data: {
                routes,
                kpis: {
                    avgLoadFactor,
                    avgCompletionRate,
                    topRevenue,
                    totalRoutes: routes.length,
                    critical,
                    low,
                    healthy: routes.filter(r => r.metrics.performance === "HEALTHY").length,
                },
                windowDays,
            },
        });

    } catch (err) {
        logger.error("tripOverviewController: getRoutePerformance error", {
            error: err.message,
            stack: err.stack,
        });
        return res.status(500).json({ success: false, message: err.message });
    }
};


module.exports = {
    getOverview,
    getScheduleHealth,
    searchTrips,
    getRoutePerformance,
};

