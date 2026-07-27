"use strict";

const createFinancialSummaryService = ({ mongoose, Booking, Refund }) => {
  const aggregateWindow = async (busId, dateFrom, dateTo) => {
    const createdAt = { $gte: dateFrom };
    if (dateTo) createdAt.$lt = dateTo;
    const objectId = new mongoose.Types.ObjectId(busId);
    const [booking] = await Booking.aggregate([
      {
        $match: {
          busId: objectId,
          status: { $in: ["booked", "no_show"] },
          createdAt,
        },
      },
      {
        $group: {
          _id: null,
          gross: { $sum: "$totalAmount" },
          originalTotal: { $sum: "$originalAmount" },
          discountsGiven: { $sum: "$discountAmount" },
          bookingCount: { $sum: 1 },
          passengerCount: { $sum: { $size: "$seats" } },
        },
      },
    ]);
    const cancelledIds = await Booking.find({
      busId: objectId,
      status: "cancelled",
      createdAt,
    })
      .select("_id")
      .lean()
      .then((docs) => docs.map((doc) => doc._id));
    let refunds = 0;
    let refundCount = 0;
    if (cancelledIds.length) {
      const [refund] = await Refund.aggregate([
        {
          $match: {
            bookingId: { $in: cancelledIds },
            status: { $in: ["completed", "processing"] },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$refundAmount" },
            count: { $sum: 1 },
          },
        },
      ]);
      if (refund) {
        refunds = refund.total;
        refundCount = refund.count;
      }
    }
    const gross = booking?.gross || 0;
    return {
      gross,
      originalTotal: booking?.originalTotal || 0,
      discountsGiven: booking?.discountsGiven || 0,
      commission: 0,
      refunds,
      refundCount,
      net: gross - refunds,
      bookingCount: booking?.bookingCount || 0,
      passengerCount: booking?.passengerCount || 0,
    };
  };

  const summarize = async ({
    busId,
    commissionRate,
    thisMonthStart,
    lastMonthStart,
  }) => {
    const windows = await Promise.all([
      aggregateWindow(busId, thisMonthStart, null),
      aggregateWindow(busId, lastMonthStart, thisMonthStart),
      aggregateWindow(busId, new Date("2020-01-01"), null),
    ]);
    const applyCommission = (data) => {
      data.commission = Math.round(data.gross * (commissionRate / 100));
      data.net = data.gross - data.commission - data.refunds;
      return data;
    };
    return {
      commissionRate,
      thisMonth: applyCommission(windows[0]),
      lastMonth: applyCommission(windows[1]),
      allTime: applyCommission(windows[2]),
    };
  };

  return { aggregateWindow, summarize };
};

module.exports = { createFinancialSummaryService };
