const Transaction = require("../../../models/transactionModel.js");
const mongoose    = require("mongoose");

/* ─── shared populate helper ─── */
const TRANSACTION_POPULATE = [
  { path: "userId",     select: "name email phone profilePicture" },
  { path: "bookingId",  populate: [
      {
        path: "tripId",
        populate: [
          { path: "busId",   select: "busName busNumber busType" },
          { path: "routeId", select: "from to duration distance routeName" },
        ],
      },
    ],
  },
  { path: "resolvedBy", select: "name email" },
];

/* ─────────────────────────────────────────
   GET /transactions  — paginated list + stats
───────────────────────────────────────── */
const getAllTransactions = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 20);
    const skip   = (page - 1) * limit;

    // Optional filters
    const filter = {};
    if (req.query.status)          filter.status          = req.query.status.toUpperCase();
    if (req.query.transactionType) filter.transactionType = req.query.transactionType.toUpperCase();
    if (req.query.gateway)         filter.gateway         = req.query.gateway;

    // Text search on transactionId or ticketId
    if (req.query.search) {
      const regex = new RegExp(req.query.search, "i");
      filter.$or = [{ transactionId: regex }, { ticketId: regex }];
    }

    const [transactions, total, stats] = await Promise.all([
      Transaction.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate(TRANSACTION_POPULATE),

      Transaction.countDocuments(filter),

      // Aggregate stats (not filtered by page — always total)
      Transaction.aggregate([
        {
          $group: {
            _id:              null,
            totalVolume:      { $sum: "$totalAmount" },
            successCount:     { $sum: { $cond: [{ $eq: ["$status", "SUCCESS"] }, 1, 0] } },
            failedCount:      { $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, 1, 0] } },
            pendingCount:     { $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] } },
            disputedCount:    { $sum: { $cond: [{ $eq: ["$status", "DISPUTED"] }, 1, 0] } },
            refundedCount:    { $sum: { $cond: [{ $eq: ["$status", "REFUNDED"] }, 1, 0] } },
            totalCount:       { $sum: 1 },
          },
        },
      ]),
    ]);

    const s = stats[0] ?? {};

    return res.status(200).json({
      success: true,
      message: "Transactions retrieved successfully",
      data: transactions,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      stats: {
        totalVolume:   s.totalVolume   ?? 0,
        totalCount:    s.totalCount    ?? 0,
        successCount:  s.successCount  ?? 0,
        failedCount:   s.failedCount   ?? 0,
        pendingCount:  s.pendingCount  ?? 0,
        disputedCount: s.disputedCount ?? 0,
        refundedCount: s.refundedCount ?? 0,
        successRate:   s.totalCount
          ? ((s.successCount / s.totalCount) * 100).toFixed(1) + "%"
          : "0%",
      },
    });
  } catch (err) {
    console.error("getAllTransactions error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

/* ─────────────────────────────────────────
   GET /transactions/:id  — single transaction
───────────────────────────────────────── */
const getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid transaction ID" });
    }

    const txn = await Transaction.findById(id).populate(TRANSACTION_POPULATE);

    if (!txn) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Transaction retrieved successfully",
      data: txn,
    });
  } catch (err) {
    console.error("getTransactionById error:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

module.exports = { getAllTransactions, getTransactionById };
