/**
 * controllers/adminController/financialController/financialController.js
 *
 * Financial overview for the super admin dashboard.
 * Aggregates from Booking + Settlement models — no hardcoded numbers.
 *
 * Endpoints:
 *   GET /api/admin/financial/overview  — KPI summary + monthly chart data
 */

const Booking    = require("../../../models/bookTicketModel.js");
const Settlement = require("../../../models/settlementModel.js");
const logger     = require("../../../utils/logger.js");

// ─── GET /api/admin/financial/overview ──────────────────────────────────────
const getFinancialOverview = async (req, res) => {
    try {
        const now          = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // ── 1. Platform Revenue: sum of all confirmed booking totalAmounts ──
        const [revenueAgg] = await Booking.aggregate([
            { $match: { status: "booked" } },
            {
                $group: {
                    _id:              null,
                    totalRevenue:     { $sum: "$totalAmount" },
                    totalBookings:    { $sum: 1 },
                    totalOriginal:    { $sum: "$originalAmount" },
                    totalDiscount:    { $sum: "$discountAmount" },
                }
            }
        ]);

        // ── 2. Commission collected (from paid settlements) ──
        const [commissionAgg] = await Settlement.aggregate([
            { $match: { status: "paid" } },
            {
                $group: {
                    _id:             null,
                    totalCommission: { $sum: "$platformCommission" },
                    paidCount:       { $sum: 1 },
                }
            }
        ]);

        // ── 3. Pending settlements ──
        const [pendingAgg] = await Settlement.aggregate([
            { $match: { status: { $in: ["pending", "processing"] } } },
            {
                $group: {
                    _id:            null,
                    pendingAmount:  { $sum: "$netPayableAmount" },
                    pendingCount:   { $sum: 1 },
                }
            }
        ]);

        // ── 4. Transaction success rate ──
        const totalBookings   = await Booking.countDocuments({});
        const failedBookings  = await Booking.countDocuments({ status: "cancelled" });
        const successRate     = totalBookings > 0
            ? ((totalBookings - failedBookings) / totalBookings * 100)
            : 0;

        // ── 5. Payment method breakdown ──
        const paymentBreakdown = await Booking.aggregate([
            { $match: { status: "booked" } },
            {
                $group: {
                    _id:   "$gateway",
                    count: { $sum: 1 },
                    total: { $sum: "$totalAmount" },
                }
            },
            { $sort: { total: -1 } }
        ]);

        // ── 6. Monthly revenue chart — last 12 months ──
        const twelveMonthsAgo = new Date();
        twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
        twelveMonthsAgo.setDate(1);
        twelveMonthsAgo.setHours(0, 0, 0, 0);

        const monthlyRevenue = await Booking.aggregate([
            {
                $match: {
                    status:    "booked",
                    createdAt: { $gte: twelveMonthsAgo },
                }
            },
            {
                $group: {
                    _id: {
                        year:  { $year:  "$createdAt" },
                        month: { $month: "$createdAt" },
                    },
                    revenue:   { $sum: "$totalAmount" },
                    bookings:  { $sum: 1 },
                    commission: {
                        // Approximate commission based on 10% of revenue
                        $sum: { $multiply: ["$totalAmount", 0.10] }
                    }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const chartData = monthlyRevenue.map(m => ({
            month:      `${MONTH_NAMES[m._id.month - 1]} ${m._id.year}`,
            revenue:    Math.round(m.revenue),
            bookings:   m.bookings,
            commission: Math.round(m.commission),
        }));

        return res.status(200).json({
            success: true,
            data: {
                revenue: {
                    total:         revenueAgg?.totalRevenue  ?? 0,
                    totalBookings: revenueAgg?.totalBookings ?? 0,
                    totalDiscount: revenueAgg?.totalDiscount ?? 0,
                },
                commission: {
                    totalCollected: commissionAgg?.totalCommission ?? 0,
                    paidCount:      commissionAgg?.paidCount       ?? 0,
                },
                pendingSettlements: {
                    amount: pendingAgg?.pendingAmount ?? 0,
                    count:  pendingAgg?.pendingCount  ?? 0,
                },
                transactionSuccessRate: parseFloat(successRate.toFixed(2)),
                paymentBreakdown: paymentBreakdown.map(p => ({
                    gateway: p._id ?? "unknown",
                    count:   p.count,
                    total:   Math.round(p.total),
                })),
                monthlyChart: chartData,
            }
        });
    } catch (err) {
        logger.error("financialController: getFinancialOverview error", { error: err.message });
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = { getFinancialOverview };
