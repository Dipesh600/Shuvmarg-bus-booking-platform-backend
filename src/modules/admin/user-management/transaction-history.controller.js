"use strict";

function createTransactionHistoryController({
  Transaction,
  isValidObjectId,
  logger = console,
}) {
  return async function getUserTransactions(req, res) {
    try {
      const { id } = req.params;
      if (!id || !isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Valid user ID is required!",
        });
      }
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
      const skip = (page - 1) * limit;
      const [transactions, totalCount] = await Promise.all([
        Transaction.find({ userId: id })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate(
            "bookingId",
            "ticketId seats totalAmount status paymentMethod bookedAt"
          )
          .lean(),
        Transaction.countDocuments({ userId: id }),
      ]);
      return res.status(200).json({
        success: true,
        message: "User transactions retrieved successfully!",
        data: transactions,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      });
    } catch (error) {
      logger.error("getUserTransactions error:", error);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error!",
      });
    }
  };
}

module.exports = { createTransactionHistoryController };
