"use strict";

function createCouponHistoryService({ repository, mapper }) {
  return async function getCouponHistory(input) {
    const page = input.page === undefined ? 1 : input.page;
    const limit = input.limit === undefined ? 10 : input.limit;
    const history = await repository.findUsageHistory(
      input.userId,
      page,
      limit
    );
    const total = await repository.countUsageHistory(input.userId);
    const savings = history.reduce(
      (sum, usage) =>
        sum + (usage.status === "applied" ? usage.discountAmount : 0),
      0
    );
    const totalPages = Math.ceil(total / limit);
    return {
      statusCode: 200,
      body: {
        success: true,
        message: "Coupon usage history retrieved successfully!",
        data: history.map(mapper.mapUsage),
        summary: {
          totalSavings: Math.round(savings * 100) / 100,
          totalCouponsUsed: total,
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalRecords: total,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    };
  };
}

module.exports = { createCouponHistoryService };
