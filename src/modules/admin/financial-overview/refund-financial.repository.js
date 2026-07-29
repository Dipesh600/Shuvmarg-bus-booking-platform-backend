"use strict";

function createRefundFinancialRepository({ Refund }) {
  return {
    liability() {
      return Refund.aggregate([
        { $match: {
          status: { $in: ["pending", "processing"] },
        } },
        { $group: {
          _id: null,
          amount: { $sum: "$refundAmount" },
          count: { $sum: 1 },
        } },
      ]);
    },
    statistics() {
      return Refund.aggregate([
        { $group: {
          _id: null,
          totalPaid: { $sum: { $cond: [
            { $eq: ["$status", "completed"] },
            "$refundAmount",
            0,
          ] } },
          totalPaidCount: { $sum: { $cond: [
            { $eq: ["$status", "completed"] }, 1, 0,
          ] } },
          totalPending: { $sum: { $cond: [
            { $in: ["$status", ["pending", "processing"]] },
            "$refundAmount",
            0,
          ] } },
          cancellationCharges: { $sum: "$cancellationCharge" },
        } },
      ]);
    },
    monthly(start) {
      return Refund.aggregate([
        { $match: {
          status: "completed",
          createdAt: { $gte: start },
        } },
        { $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          refunds: { $sum: "$refundAmount" },
          count: { $sum: 1 },
        } },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]);
    },
  };
}

module.exports = { createRefundFinancialRepository };
