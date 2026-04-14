/**
 * controllers/adminController/analyticsController/analyticsController.js
 *
 * Business intelligence & analytics aggregation for the super admin dashboard.
 *
 * Endpoint:
 *   GET /api/admin/analytics/overview  — full analytics overview
 */

const User     = require("../../../models/userModel.js");
const Booking  = require("../../../models/bookTicketModel.js");
const Trip     = require("../../../models/tripModel.js");
const BusRoute = require("../../../models/busRouteModel.js");
const logger   = require("../../../utils/logger.js");

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─── GET /api/admin/analytics/overview ──────────────────────────────────────
const getAnalyticsOverview = async (req, res) => {
    try {
        const now = new Date();

        // ── 1. User growth — last 12 months (new registrations per month) ──
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
        twelveMonthsAgo.setDate(1);
        twelveMonthsAgo.setHours(0, 0, 0, 0);

        const userGrowthRaw = await User.aggregate([
            { $match: { createdAt: { $gte: twelveMonthsAgo } } },
            {
                $group: {
                    _id: {
                        year:  { $year:  "$createdAt" },
                        month: { $month: "$createdAt" },
                    },
                    newUsers: { $sum: 1 },
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        const totalUsers   = await User.countDocuments({});
        const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const usersLastMonth  = await User.countDocuments({ createdAt: { $gte: prevMonthStart, $lt: thisMonthStart } });
        const usersThisMonth  = await User.countDocuments({ createdAt: { $gte: thisMonthStart } });

        // Build cumulative user growth chart (running total)
        let runningTotal = totalUsers;
        const userGrowthChart = userGrowthRaw.map(m => ({
            month:    `${MONTH_NAMES[m._id.month - 1]} ${m._id.year}`,
            newUsers: m.newUsers,
            total:    runningTotal,  // approximate; exact would need full scan
        }));

        // ── 2. Booking trends — last 12 months ──
        const bookingTrendsRaw = await Booking.aggregate([
            { $match: { createdAt: { $gte: twelveMonthsAgo } } },
            {
                $group: {
                    _id: {
                        year:  { $year:  "$createdAt" },
                        month: { $month: "$createdAt" },
                    },
                    bookings: { $sum: 1 },
                    revenue:  { $sum: "$totalAmount" },
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        const bookingTrendChart = bookingTrendsRaw.map(m => ({
            month:    `${MONTH_NAMES[m._id.month - 1]} ${m._id.year}`,
            bookings: m.bookings,
            revenue:  Math.round(m.revenue),
        }));

        // ── 3. Top routes by booking volume ──
        const topRoutesRaw = await Booking.aggregate([
            { $match: { status: "booked" } },
            { $lookup: {
                from:         "trips",
                localField:   "tripId",
                foreignField: "_id",
                as:           "trip",
            }},
            { $unwind: "$trip" },
            {
                $group: {
                    _id:      "$trip.routeId",
                    bookings: { $sum: 1 },
                    revenue:  { $sum: "$totalAmount" },
                }
            },
            { $sort: { bookings: -1 } },
            { $limit: 6 },
            { $lookup: {
                from:         "busroutes",
                localField:   "_id",
                foreignField: "_id",
                as:           "route",
            }},
            { $unwind: { path: "$route", preserveNullAndEmpty: true } },
        ]);

        const topRoutes = topRoutesRaw.map(r => ({
            route:    r.route?.routeName
                   ?? (r.route?.from && r.route?.to ? `${r.route.from} → ${r.route.to}` : "Unknown Route"),
            bookings: r.bookings,
            revenue:  Math.round(r.revenue),
        }));

        // ── 4. Platform KPIs ──
        const [bookingStats] = await Booking.aggregate([
            {
                $group: {
                    _id:           null,
                    totalBookings: { $sum: 1 },
                    totalRevenue:  { $sum: "$totalAmount" },
                    cancelled:     { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
                }
            }
        ]);

        const totalBookings     = bookingStats?.totalBookings ?? 0;
        const cancelledBookings = bookingStats?.cancelled ?? 0;
        const successRate       = totalBookings > 0
            ? parseFloat(((totalBookings - cancelledBookings) / totalBookings * 100).toFixed(1))
            : 0;

        const avgTransaction = totalBookings > 0
            ? Math.round((bookingStats?.totalRevenue ?? 0) / totalBookings)
            : 0;

        // Fleet utilization: (total booked seats / total trip capacity) — approximate
        const [seatStats] = await Booking.aggregate([
            { $match: { status: "booked" } },
            { $group: { _id: null, totalSeats: { $sum: { $size: "$seats" } } } }
        ]);

        const totalTrips     = await Trip.countDocuments({});
        const avgFleetUtil   = totalTrips > 0 && seatStats?.totalSeats
            ? Math.min(99, Math.round(seatStats.totalSeats / (totalTrips * 30) * 100)) // ~30 seats avg
            : 0;

        // User growth rate MoM
        const growthRate = usersLastMonth > 0
            ? parseFloat(((usersThisMonth - usersLastMonth) / usersLastMonth * 100).toFixed(1))
            : 0;

        return res.status(200).json({
            success: true,
            data: {
                kpis: {
                    totalUsers,
                    usersThisMonth,
                    userGrowthRate:       growthRate,
                    totalBookings,
                    bookingSuccessRate:   successRate,
                    avgTransactionAmount: avgTransaction,
                    fleetUtilization:     avgFleetUtil,
                    totalRevenue:         Math.round(bookingStats?.totalRevenue ?? 0),
                },
                userGrowthChart,
                bookingTrendChart,
                topRoutes,
            }
        });

    } catch (err) {
        logger.error("analyticsController: getAnalyticsOverview error", { error: err.message });
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = { getAnalyticsOverview };
