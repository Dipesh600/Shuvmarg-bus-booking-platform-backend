/**
 * brandFinancialService.js
 *
 * Real MongoDB aggregation pipelines for brand-level financial data.
 * All queries use the denormalized brandId field on Booking — no multi-hop joins.
 *
 * Queries:
 *   getBrandFinancialOverview(brandId) → KPI cards + monthly chart + fleet breakdown
 *   getBrandSettlementSummary(brandId) → pending/paid settlement totals
 */

const Booking    = require("../models/bookTicketModel.js");
const Trip       = require("../models/tripModel.js");
const Settlement = require("../models/settlementModel.js");
const Fleet      = require("../models/fleetModel.js");
const mongoose   = require("mongoose");

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ─────────────────────────────────────────────────────────────────────────────
// getBrandFinancialOverview
// ─────────────────────────────────────────────────────────────────────────────
const getBrandFinancialOverview = async (brandId) => {
    const bId = new mongoose.Types.ObjectId(brandId);

    // ── 1. ALL-TIME KPIs ────────────────────────────────────────────────────
    const [kpiAgg] = await Booking.aggregate([
        { $match: { brandId: bId, status: "booked" } },
        {
            $group: {
                _id:              null,
                totalGross:       { $sum: "$totalAmount" },
                totalBookings:    { $sum: 1 },
                totalTickets:     { $sum: { $size: "$seats" } },
                totalDiscount:    { $sum: { $ifNull: ["$discountAmount", 0] } },
            }
        }
    ]);

    // ── 2. THIS MONTH KPIs ──────────────────────────────────────────────────
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [monthKpi] = await Booking.aggregate([
        { $match: { brandId: bId, status: "booked", createdAt: { $gte: startOfMonth } } },
        {
            $group: {
                _id:           null,
                monthRevenue:  { $sum: "$totalAmount" },
                monthBookings: { $sum: 1 },
                monthTickets:  { $sum: { $size: "$seats" } },
            }
        }
    ]);

    // ── 3. SETTLEMENT TOTALS ────────────────────────────────────────────────
    const settlementAgg = await Settlement.aggregate([
        { $match: { brandId: bId } },
        {
            $group: {
                _id:    "$status",
                amount: { $sum: "$netPayableAmount" },
                count:  { $sum: 1 },
            }
        }
    ]);

    const settlementMap = {};
    for (const s of settlementAgg) {
        settlementMap[s._id] = { amount: s.amount, count: s.count };
    }

    const pendingSettlement = (settlementMap["pending"]?.amount || 0) +
                              (settlementMap["processing"]?.amount || 0);
    const paidSettlement    =  settlementMap["paid"]?.amount || 0;

    // ── 4. MONTHLY REVENUE CHART — last 12 months ───────────────────────────
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const monthlyRaw = await Booking.aggregate([
        {
            $match: {
                brandId:   bId,
                status:    "booked",
                createdAt: { $gte: twelveMonthsAgo },
            }
        },
        {
            $group: {
                _id:      { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
                revenue:  { $sum: "$totalAmount" },
                bookings: { $sum: 1 },
                tickets:  { $sum: { $size: "$seats" } },
            }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    // Build a full 12-month array (fill gaps with 0)
    const chartData = buildMonthlyChart(monthlyRaw, 12);

    // ── 5. FLEET REVENUE BREAKDOWN ──────────────────────────────────────────
    // Revenue per bus in this brand
    const fleetRaw = await Booking.aggregate([
        { $match: { brandId: bId, status: "booked" } },
        {
            $group: {
                _id:     "$busId",
                revenue: { $sum: "$totalAmount" },
                tickets: { $sum: { $size: "$seats" } },
                bookings:{ $sum: 1 },
            }
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 }
    ]);

    // Populate bus names
    const busIds = fleetRaw.map(f => f._id).filter(Boolean);
    const buses  = await Fleet.find({ _id: { $in: busIds } })
        .select("busName busNumber busType")
        .lean();
    const busMap = Object.fromEntries(buses.map(b => [b._id.toString(), b]));

    const fleetBreakdown = fleetRaw.map(f => ({
        busId:   f._id,
        bus:     busMap[f._id?.toString()] || { busName: "Unknown", busNumber: "—" },
        revenue: f.revenue,
        tickets: f.tickets,
        bookings: f.bookings,
    }));

    // ── 6. TRIP OCCUPANCY RATE ──────────────────────────────────────────────
    // For completed trips in this brand: avg occupancy %
    // We approximate: tickets sold / capacity per trip
    const occupancyAgg = await Trip.aggregate([
        { $match: { brandId: bId, status: "completed" } },
        {
            $lookup: {
                from:         "booktickers",     // Booking collection name
                localField:   "_id",
                foreignField: "tripId",
                as:           "bookings",
                pipeline: [{ $match: { status: "booked" } }, { $project: { seats: 1 } }],
            }
        },
        {
            $addFields: {
                seatsSold: { $sum: { $map: { input: "$bookings", as: "b", in: { $size: "$$b.seats" } } } }
            }
        },
        {
            $group: {
                _id:           null,
                totalTrips:    { $sum: 1 },
                totalSeatsSold:{ $sum: "$seatsSold" },
            }
        }
    ]);

    const occupancy = occupancyAgg[0] || { totalTrips: 0, totalSeatsSold: 0 };

    // ── 7. TRIP STATUS COUNTS ───────────────────────────────────────────────
    const tripStatusAgg = await Trip.aggregate([
        { $match: { brandId: bId } },
        { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    const tripCounts = {};
    for (const t of tripStatusAgg) tripCounts[t._id] = t.count;

    // ── COMPOSE RESPONSE ────────────────────────────────────────────────────
    return {
        kpis: {
            totalGross:        kpiAgg?.totalGross    ?? 0,
            totalBookings:     kpiAgg?.totalBookings ?? 0,
            totalTickets:      kpiAgg?.totalTickets  ?? 0,
            totalDiscount:     kpiAgg?.totalDiscount ?? 0,
            avgTicketPrice:    kpiAgg?.totalTickets
                ? Math.round((kpiAgg.totalGross / kpiAgg.totalTickets))
                : 0,
        },
        thisMonth: {
            revenue:  monthKpi?.monthRevenue  ?? 0,
            bookings: monthKpi?.monthBookings ?? 0,
            tickets:  monthKpi?.monthTickets  ?? 0,
        },
        settlements: {
            pending:     pendingSettlement,
            paid:        paidSettlement,
            pendingCount: (settlementMap["pending"]?.count || 0) + (settlementMap["processing"]?.count || 0),
        },
        monthlyChart:   chartData,
        fleetBreakdown,
        trips: {
            scheduled:  tripCounts["scheduled"]  || 0,
            completed:  tripCounts["completed"]  || 0,
            cancelled:  tripCounts["cancelled"]  || 0,
            inTransit:  tripCounts["in_transit"] || 0,
            total: Object.values(tripCounts).reduce((a, b) => a + b, 0),
        },
        occupancy: {
            totalCompletedTrips: occupancy.totalTrips,
            totalSeatsSold:      occupancy.totalSeatsSold,
        },
    };
};

// ─── HELPER: Build a full 12-slot monthly array, filling gaps with 0 ─────────
const buildMonthlyChart = (rawData, months = 12) => {
    const now = new Date();
    const result = [];

    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year  = d.getFullYear();
        const month = d.getMonth() + 1; // 1-indexed

        const found = rawData.find(r => r._id.year === year && r._id.month === month);
        result.push({
            month:    `${MONTH_NAMES[month - 1]} ${year}`,
            label:    MONTH_NAMES[month - 1],
            revenue:  found?.revenue  ?? 0,
            bookings: found?.bookings ?? 0,
            tickets:  found?.tickets  ?? 0,
        });
    }
    return result;
};

module.exports = { getBrandFinancialOverview };
