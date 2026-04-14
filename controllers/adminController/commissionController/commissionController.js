/**
 * controllers/adminController/commissionController/commissionController.js
 *
 * Commission analytics for the super admin dashboard.
 *
 * Commission model: Platform deducts a % from each booking via Settlement.
 * We derive commission history from Booking records; summary from Settlements.
 *
 * Endpoints:
 *   GET /api/admin/commissions/summary   — KPI totals
 *   GET /api/admin/commissions/history   — per-booking log (paginated)
 */

const Settlement = require("../../../models/settlementModel.js");
const Booking    = require("../../../models/bookTicketModel.js");
const Trip       = require("../../../models/tripModel.js");
const User       = require("../../../models/userModel.js");
const logger     = require("../../../utils/logger.js");

// ─── GET /api/admin/commissions/summary ─────────────────────────────────────
const getCommissionSummary = async (req, res) => {
    try {
        const now          = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        // Aggregate directly from Settlement collection — source of truth for commissions
        const [overall] = await Settlement.aggregate([
            {
                $group: {
                    _id: null,
                    totalCommission:    { $sum: "$platformCommission" },
                    pendingPayouts:     {
                        $sum: {
                            $cond: [
                                { $in: ["$status", ["pending", "processing"]] },
                                "$netPayableAmount",
                                0
                            ]
                        }
                    },
                    pendingCount:       {
                        $sum: {
                            $cond: [{ $in: ["$status", ["pending", "processing"]] }, 1, 0]
                        }
                    },
                    avgCommissionRate:  { $avg: "$commissionRate" },
                    totalSettlements:   { $sum: 1 },
                }
            }
        ]);

        // Paid out this calendar month
        const [monthlyPaid] = await Settlement.aggregate([
            {
                $match: {
                    status: "paid",
                    paidAt: { $gte: startOfMonth },
                }
            },
            {
                $group: {
                    _id:           null,
                    paidThisMonth: { $sum: "$netPayableAmount" },
                    paidCount:     { $sum: 1 },
                }
            }
        ]);

        return res.status(200).json({
            success: true,
            data: {
                totalCommission:   overall?.totalCommission   ?? 0,
                pendingPayouts:    overall?.pendingPayouts     ?? 0,
                pendingCount:      overall?.pendingCount       ?? 0,
                avgCommissionRate: overall?.avgCommissionRate  ? parseFloat(overall.avgCommissionRate.toFixed(2)) : 10,
                totalSettlements:  overall?.totalSettlements   ?? 0,
                paidThisMonth:     monthlyPaid?.paidThisMonth  ?? 0,
                paidCount:         monthlyPaid?.paidCount       ?? 0,
            }
        });
    } catch (err) {
        logger.error("commissionController: getCommissionSummary error", { error: err.message });
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

// ─── GET /api/admin/commissions/history?page=1&limit=20 ─────────────────────
const getCommissionHistory = async (req, res) => {
    try {
        const page  = Math.max(1, parseInt(req.query.page)  || 1);
        const limit = Math.min(100, parseInt(req.query.limit) || 20);
        const skip  = (page - 1) * limit;

        const total = await Settlement.countDocuments();

        const settlements = await Settlement.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("ownerId", "name email phone")
            .lean();

        // Each settlement maps to one commission history row
        const history = settlements.map(s => ({
            settlementId:      s._id,
            busOwner:          {
                id:    s.ownerId?._id,
                name:  s.ownerId?.name  ?? "—",
                email: s.ownerId?.email ?? "—",
            },
            tripCount:         s.tripIds?.length ?? 0,
            grossAmount:       s.grossAmount,
            commissionRate:    s.commissionRate,
            commissionEarned:  s.platformCommission,
            netPayable:        s.netPayableAmount,
            ticketsSold:       s.totalTicketsSold,
            status:            s.status,
            raisedAt:          s.raisedAt,
            paidAt:            s.paidAt,
        }));

        return res.status(200).json({
            success: true,
            data: {
                history,
                pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
            }
        });
    } catch (err) {
        logger.error("commissionController: getCommissionHistory error", { error: err.message });
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

module.exports = { getCommissionSummary, getCommissionHistory };
