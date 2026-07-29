"use strict";

function createSettlementFinancialRepository({ Settlement }) {
  return {
    paidAllTime() {
      return Settlement.aggregate([
        { $match: { status: "paid" } },
        { $group: {
          _id: null,
          total: { $sum: "$platformCommission" },
          count: { $sum: 1 },
          grossPaid: { $sum: "$grossAmount" },
        } },
      ]);
    },
    paidThisMonth(start) {
      return Settlement.aggregate([
        { $match: { status: "paid", updatedAt: { $gte: start } } },
        { $group: {
          _id: null,
          total: { $sum: "$platformCommission" },
          gross: { $sum: "$grossAmount" },
        } },
      ]);
    },
    paidLastMonth(start, end) {
      return Settlement.aggregate([
        { $match: {
          status: "paid",
          updatedAt: { $gte: start, $lte: end },
        } },
        { $group: {
          _id: null,
          total: { $sum: "$platformCommission" },
        } },
      ]);
    },
    pending() {
      return Settlement.aggregate([
        { $match: {
          status: { $in: ["pending", "processing"] },
        } },
        { $group: {
          _id: null,
          amount: { $sum: "$netPayableAmount" },
          count: { $sum: 1 },
          pending: { $sum: { $cond: [
            { $eq: ["$status", "pending"] }, 1, 0,
          ] } },
          processing: { $sum: { $cond: [
            { $eq: ["$status", "processing"] }, 1, 0,
          ] } },
        } },
      ]);
    },
    monthly(start) {
      return Settlement.aggregate([
        { $match: {
          status: "paid",
          updatedAt: { $gte: start },
        } },
        { $group: {
          _id: {
            year: { $year: "$updatedAt" },
            month: { $month: "$updatedAt" },
          },
          commission: { $sum: "$platformCommission" },
          settled: { $sum: "$netPayableAmount" },
        } },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
      ]);
    },
    queue() {
      return Settlement.find({
        status: { $in: ["pending", "processing"] },
      })
        .sort({ raisedAt: 1 })
        .limit(10)
        .populate("brandId", "brandName")
        .populate("ownerId", "name")
        .select(
          "netPayableAmount platformCommission commissionRate status " +
          "raisedAt totalTicketsSold grossAmount brandId ownerId"
        )
        .lean();
    },
    averageRate() {
      return Settlement.aggregate([
        { $group: {
          _id: null,
          avgRate: { $avg: "$commissionRate" },
        } },
      ]);
    },
  };
}

module.exports = { createSettlementFinancialRepository };
