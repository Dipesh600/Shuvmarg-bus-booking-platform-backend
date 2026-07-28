/**
 * financialController.js — Platform Financial Command Center
 *
 * GET /api/admin/financial/overview?months=3|6|12
 *
 * Returns: KPIs + MoM deltas + booking breakdown + operator leaderboard +
 *          monthly chart (GBV/commission/refunds/bookings) + gateway mix +
 *          settlement queue + coupon/discount impact + status distribution
 */

const Booking    = require("../../../models/bookTicketModel.js");
const Settlement = require("../../../models/settlementModel.js");
const Refund     = require("../../../models/refundModel.js");
const logger     = require("../../../utils/logger.js");

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun",
                     "Jul","Aug","Sep","Oct","Nov","Dec"];

function monthStart(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}
function monthsAgo(n) {
    const d = new Date();
    d.setMonth(d.getMonth() - n);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

// ─── Controller ──────────────────────────────────────────────────────────────

const getFinancialOverview = async (req, res) => {
    try {
        const chartMonths     = Math.min(24, Math.max(1, parseInt(req.query.months, 10) || 12));
        const now             = new Date();
        const thisMonthStart  = monthStart(now);
        const lastMonthStart  = monthStart(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        const lastMonthEnd    = new Date(thisMonthStart.getTime() - 1);
        const chartWindowStart = monthsAgo(chartMonths - 1);

        // ── Run all aggregations in parallel ───────────────────────────────────
        const [
            gbvThisMonth,
            gbvLastMonth,
            gbvAllTime,
            commissionPaid,
            commissionThisMonth,
            commissionLastMonth,
            pendingSettl,
            refundLiability,
            refundStats,
            bookingStatusDist,
            couponImpact,
            gatewayRaw,
            operatorLeaderboard,
            monthlyBookings,
            monthlyCommission,
            monthlyRefunds,
            settlementQueue,
            avgCommissionRate,   // avg rate from all settlement records (handles settlement lag)
        ] = await Promise.all([

            // 1. GBV this month
            Booking.aggregate([
                { $match: { status: "booked", createdAt: { $gte: thisMonthStart } } },
                { $group: {
                    _id: null,
                    gbv:      { $sum: "$totalAmount" },
                    count:    { $sum: 1 },
                    seats:    { $sum: { $size: "$seats" } },
                    discount: { $sum: "$discountAmount" },
                    gatewayFees: { $sum: { $multiply: ["$totalAmount", { $divide: ["$gatewayFeeRate", 100] }] } },
                }},
            ]),

            // 2. GBV last month
            Booking.aggregate([
                { $match: { status: "booked", createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd } } },
                { $group: { _id: null, gbv: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
            ]),

            // 3. GBV all time
            Booking.aggregate([
                { $match: { status: "booked" } },
                { $group: {
                    _id: null,
                    gbv:         { $sum: "$totalAmount" },
                    count:       { $sum: 1 },
                    original:    { $sum: "$originalAmount" },
                    discount:    { $sum: "$discountAmount" },
                    seats:       { $sum: { $size: "$seats" } },
                    avgTicket:   { $avg: "$totalAmount" },
                }},
            ]),

            // 4. Commission all time (real — from paid settlements)
            Settlement.aggregate([
                { $match: { status: "paid" } },
                { $group: {
                    _id: null,
                    total:     { $sum: "$platformCommission" },
                    count:     { $sum: 1 },
                    grossPaid: { $sum: "$grossAmount" },
                }},
            ]),

            // 5. Commission this month
            Settlement.aggregate([
                { $match: { status: "paid", updatedAt: { $gte: thisMonthStart } } },
                { $group: { _id: null, total: { $sum: "$platformCommission" }, gross: { $sum: "$grossAmount" } } },
            ]),

            // 6. Commission last month
            Settlement.aggregate([
                { $match: { status: "paid", updatedAt: { $gte: lastMonthStart, $lte: lastMonthEnd } } },
                { $group: { _id: null, total: { $sum: "$platformCommission" } } },
            ]),

            // 7. Pending settlements
            Settlement.aggregate([
                { $match: { status: { $in: ["pending", "processing"] } } },
                { $group: {
                    _id: null,
                    amount:  { $sum: "$netPayableAmount" },
                    count:   { $sum: 1 },
                    pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
                    processing: { $sum: { $cond: [{ $eq: ["$status", "processing"] }, 1, 0] } },
                }},
            ]),

            // 8. Refund liability (pending/processing)
            Refund.aggregate([
                { $match: { status: { $in: ["pending", "processing"] } } },
                { $group: { _id: null, amount: { $sum: "$refundAmount" }, count: { $sum: 1 } } },
            ]),

            // 9. Refund full stats (all time + this month completed)
            Refund.aggregate([
                { $group: {
                    _id: null,
                    totalPaid:     { $sum: { $cond: [{ $eq: ["$status", "completed"] }, "$refundAmount", 0] } },
                    totalPaidCount:{ $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                    totalPending:  { $sum: { $cond: [{ $in: ["$status", ["pending","processing"]] }, "$refundAmount", 0] } },
                    cancellationCharges: { $sum: "$cancellationCharge" },
                }},
            ]),

            // 10. Booking status distribution
            Booking.aggregate([
                { $group: { _id: "$status", count: { $sum: 1 }, value: { $sum: "$totalAmount" } } },
                { $sort: { count: -1 } },
            ]),

            // 11. Coupon impact
            Booking.aggregate([
                { $match: { status: "booked", couponUsed: { $ne: null } } },
                { $group: {
                    _id: null,
                    couponBookings: { $sum: 1 },
                    couponDiscount: { $sum: "$discountAmount" },
                    couponRevenue:  { $sum: "$totalAmount" },
                }},
            ]),

            // 12. Gateway breakdown
            Booking.aggregate([
                { $match: { status: "booked" } },
                { $group: {
                    _id:       "$gateway",
                    count:     { $sum: 1 },
                    total:     { $sum: "$totalAmount" },
                    original:  { $sum: "$originalAmount" },
                    avgTicket: { $avg: "$totalAmount" },
                    thisMonth: { $sum: { $cond: [{ $gte: ["$createdAt", thisMonthStart] }, "$totalAmount", 0] } },
                }},
                { $sort: { total: -1 } },
            ]),

            // 13. Top 8 operator brands by GBV (from bookings)
            Booking.aggregate([
                { $match: { status: "booked" } },
                { $group: {
                    _id:       "$brandId",
                    gbv:       { $sum: "$totalAmount" },
                    count:     { $sum: 1 },
                    discount:  { $sum: "$discountAmount" },
                    seats:     { $sum: { $size: "$seats" } },
                    thisMonth: { $sum: { $cond: [{ $gte: ["$createdAt", thisMonthStart] }, "$totalAmount", 0] } },
                }},
                { $sort: { gbv: -1 } },
                { $limit: 8 },
                { $lookup: {
                    from: "operatorbrands",
                    localField: "_id",
                    foreignField: "_id",
                    as: "brand",
                }},
                { $unwind: { path: "$brand", preserveNullAndEmptyArrays: true } },
            ]),

            // 14. Monthly GBV
            Booking.aggregate([
                { $match: { status: "booked", createdAt: { $gte: chartWindowStart } } },
                { $group: {
                    _id:      { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
                    gbv:      { $sum: "$totalAmount" },
                    bookings: { $sum: 1 },
                    discount: { $sum: "$discountAmount" },
                }},
                { $sort: { "_id.year": 1, "_id.month": 1 } },
            ]),

            // 15. Monthly commission
            Settlement.aggregate([
                { $match: { status: "paid", updatedAt: { $gte: chartWindowStart } } },
                { $group: {
                    _id:        { year: { $year: "$updatedAt" }, month: { $month: "$updatedAt" } },
                    commission: { $sum: "$platformCommission" },
                    settled:    { $sum: "$netPayableAmount" },
                }},
                { $sort: { "_id.year": 1, "_id.month": 1 } },
            ]),

            // 16. Monthly refunds
            Refund.aggregate([
                { $match: { status: "completed", createdAt: { $gte: chartWindowStart } } },
                { $group: {
                    _id:     { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
                    refunds: { $sum: "$refundAmount" },
                    count:   { $sum: 1 },
                }},
                { $sort: { "_id.year": 1, "_id.month": 1 } },
            ]),

            // 17. Settlement queue (pending, oldest first)
            Settlement.find({ status: { $in: ["pending", "processing"] } })
                .sort({ raisedAt: 1 })
                .limit(10)
                .populate("brandId", "brandName")
                .populate("ownerId", "name")
                .select("netPayableAmount platformCommission commissionRate status raisedAt totalTicketsSold grossAmount brandId ownerId")
                .lean(),

            // 18. Average commission rate across ALL settlements (any status)
            // Used to estimate take rate for current month before settlements are paid out.
            // Settlements are paid with a 7–14 day lag after trips complete, so
            // commissionThisMonth is often 0 even when the month has real bookings.
            Settlement.aggregate([
                { $group: { _id: null, avgRate: { $avg: "$commissionRate" } } },
            ]),
        ]);

        // ── Derived values ───────────────────────────────────────────────────

        const gbvTM      = gbvThisMonth?.[0]?.gbv  || 0;
        const gbvLM      = gbvLastMonth?.[0]?.gbv  || 0;
        const gbvAll     = gbvAllTime?.[0]?.gbv    || 0;
        const netTM      = commissionThisMonth?.[0]?.total || 0;
        const netLM      = commissionLastMonth?.[0]?.total || 0;
        const netAll     = commissionPaid?.[0]?.total      || 0;

        const gbvDelta   = gbvLM  > 0 ? parseFloat(((gbvTM  - gbvLM)  / gbvLM  * 100).toFixed(1)) : null;
        const netDelta   = netLM  > 0 ? parseFloat(((netTM  - netLM)  / netLM  * 100).toFixed(1)) : null;

        // ── Take Rate ──────────────────────────────────────────────────────────
        // Settlements are paid 7-14 days after trips complete, so commissionThisMonth
        // is often 0 mid-month even when real bookings are happening. We fall back to
        // the platform-wide avg commission rate (from all settlement records) × GBV
        // to give an *estimated* take rate, flagged as isEstimated=true in the response.
        const avgRate      = avgCommissionRate?.[0]?.avgRate ?? 10; // default 10% if no settlements exist
        const takeRateAll  = gbvAll > 0 ? parseFloat((netAll / gbvAll * 100).toFixed(2)) : 0;

        let takeRateTM, takeRateTMIsEstimated;
        if (gbvTM > 0 && netTM > 0) {
            // Real: we have paid commission data for this month
            takeRateTM = parseFloat((netTM / gbvTM * 100).toFixed(2));
            takeRateTMIsEstimated = false;
        } else if (gbvTM > 0) {
            // Estimated: settlements haven't been paid out yet this month — use avg rate × GBV
            takeRateTM = parseFloat(avgRate.toFixed(2));
            takeRateTMIsEstimated = true;
        } else {
            takeRateTM = 0;
            takeRateTMIsEstimated = false;
        }

        const totalBookingsCount = await Booking.countDocuments({});
        const cancelledCount     = await Booking.countDocuments({ status: "cancelled" });
        const successRate = totalBookingsCount > 0
            ? parseFloat(((totalBookingsCount - cancelledCount) / totalBookingsCount * 100).toFixed(2))
            : 0;

        // Gateway volume share
        const totalGbvForShare = gbvAll || 1;
        const paymentBreakdown = (gatewayRaw || []).map(g => ({
            gateway:     g._id ?? "unknown",
            count:       g.count,
            total:       Math.round(g.total),
            original:    Math.round(g.original || 0),
            avgTicket:   Math.round(g.avgTicket || 0),
            volumeShare: parseFloat(((g.total / totalGbvForShare) * 100).toFixed(1)),
            thisMonth:   Math.round(g.thisMonth || 0),
        }));

        // Booking status distribution
        const statusMap = {};
        (bookingStatusDist || []).forEach(s => { statusMap[s._id] = { count: s.count, value: Math.round(s.value) }; });

        // Coupon stats
        const couponData  = couponImpact?.[0];
        const couponPct   = gbvAllTime?.[0]?.count > 0
            ? parseFloat(((couponData?.couponBookings || 0) / gbvAllTime[0].count * 100).toFixed(1))
            : 0;

        // Operator leaderboard
        const operators = (operatorLeaderboard || []).map(o => ({
            brandId:   o._id,
            brandName: o.brand?.brandName || "Unknown Brand",
            gbv:       Math.round(o.gbv),
            count:     o.count,
            seats:     o.seats,
            discount:  Math.round(o.discount),
            thisMonth: Math.round(o.thisMonth || 0),
            share:     parseFloat(((o.gbv / totalGbvForShare) * 100).toFixed(1)),
            avgTicket: o.count > 0 ? Math.round(o.gbv / o.count) : 0,
        }));

        // Monthly chart with all 4 series
        const chartMap = new Map();
        for (let i = 0; i < chartMonths; i++) {
            const d = new Date(chartWindowStart);
            d.setMonth(d.getMonth() + i);
            const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
            chartMap.set(key, {
                month:      `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
                gbv: 0, commission: 0, refunds: 0, bookings: 0, discount: 0,
            });
        }
        (monthlyBookings || []).forEach(b => {
            const key = `${b._id.year}-${b._id.month}`;
            if (chartMap.has(key)) Object.assign(chartMap.get(key), {
                gbv: Math.round(b.gbv), bookings: b.bookings, discount: Math.round(b.discount || 0),
            });
        });
        (monthlyCommission || []).forEach(c => {
            const key = `${c._id.year}-${c._id.month}`;
            if (chartMap.has(key)) chartMap.get(key).commission = Math.round(c.commission);
        });
        (monthlyRefunds || []).forEach(r => {
            const key = `${r._id.year}-${r._id.month}`;
            if (chartMap.has(key)) chartMap.get(key).refunds = Math.round(r.refunds);
        });

        // Refund rate
        const refundPaidTotal = refundStats?.[0]?.totalPaid || 0;
        const refundRate = gbvAll > 0 ? parseFloat((refundPaidTotal / gbvAll * 100).toFixed(2)) : 0;

        return res.status(200).json({
            success: true,
            data: {
                // ── KPIs ──────────────────────────────────────────────────
                gbv: {
                    allTime:       Math.round(gbvAll),
                    thisMonth:     Math.round(gbvTM),
                    lastMonth:     Math.round(gbvLM),
                    momDelta:      gbvDelta,
                    totalBookings: gbvAllTime?.[0]?.count  || 0,
                    totalDiscount: Math.round(gbvAllTime?.[0]?.discount || 0),
                    totalSeats:    gbvAllTime?.[0]?.seats  || 0,
                    avgTicket:     Math.round(gbvAllTime?.[0]?.avgTicket || 0),
                    thisMonthCount: gbvThisMonth?.[0]?.count || 0,
                    thisMonthSeats: gbvThisMonth?.[0]?.seats || 0,
                    thisMonthDiscount: Math.round(gbvThisMonth?.[0]?.discount || 0),
                },
                netRevenue: {
                    allTime:     Math.round(netAll),
                    thisMonth:   Math.round(netTM),
                    lastMonth:   Math.round(netLM),
                    momDelta:    netDelta,
                    paidCount:   commissionPaid?.[0]?.count || 0,
                    grossSettled:Math.round(commissionPaid?.[0]?.grossPaid || 0),
                },
                takeRate: {
                    allTime:     takeRateAll,
                    thisMonth:   takeRateTM,
                    isEstimated: takeRateTMIsEstimated, // true when using avg rate fallback (settlement lag)
                    avgRate:     parseFloat(avgRate.toFixed(2)),
                },
                pendingSettlements: {
                    amount:     Math.round(pendingSettl?.[0]?.amount  || 0),
                    count:      pendingSettl?.[0]?.count      || 0,
                    pending:    pendingSettl?.[0]?.pending    || 0,
                    processing: pendingSettl?.[0]?.processing || 0,
                },
                refundLiability: {
                    amount: Math.round(refundLiability?.[0]?.amount || 0),
                    count:  refundLiability?.[0]?.count  || 0,
                },
                refundHealth: {
                    totalPaid:          Math.round(refundPaidTotal),
                    totalPaidCount:     refundStats?.[0]?.totalPaidCount || 0,
                    cancellationIncome: Math.round(refundStats?.[0]?.cancellationCharges || 0),
                    refundRate:         refundRate, // % of GBV refunded
                },
                transactionSuccessRate: successRate,

                // ── Booking breakdown ──────────────────────────────────────
                bookingStatusDist: statusMap,
                couponImpact: {
                    bookingsWithCoupon: couponData?.couponBookings || 0,
                    discountGiven:      Math.round(couponData?.couponDiscount || 0),
                    revenueFromCoupon:  Math.round(couponData?.couponRevenue  || 0),
                    couponUsageRate:    couponPct,
                },

                // ── Operator leaderboard ───────────────────────────────────
                operatorLeaderboard: operators,

                // ── Gateway breakdown ──────────────────────────────────────
                paymentBreakdown,

                // ── Chart ──────────────────────────────────────────────────
                monthlyChart: Array.from(chartMap.values()),

                // ── Settlement queue ───────────────────────────────────────
                settlementQueue: (settlementQueue || []).map(s => ({
                    _id:         s._id,
                    brandName:   s.brandId?.brandName || "—",
                    ownerName:   s.ownerId?.name      || "—",
                    netPayable:  Math.round(s.netPayableAmount),
                    commission:  Math.round(s.platformCommission),
                    commissionRate: s.commissionRate || 10,
                    grossAmount: Math.round(s.grossAmount),
                    ticketsSold: s.totalTicketsSold,
                    status:      s.status,
                    raisedAt:    s.raisedAt,
                    daysAgo:     Math.floor((Date.now() - new Date(s.raisedAt).getTime()) / 86400000),
                })),

                // Backward compat
                revenue: {
                    total:         Math.round(gbvAll),
                    totalBookings: gbvAllTime?.[0]?.count || 0,
                    totalDiscount: Math.round(gbvAllTime?.[0]?.discount || 0),
                },
                commission: {
                    totalCollected: Math.round(netAll),
                    paidCount:      commissionPaid?.[0]?.count || 0,
                },
            }
        });
    } catch (err) {
        logger.error("financialController: getFinancialOverview error", { error: err.message });
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = { getFinancialOverview };
