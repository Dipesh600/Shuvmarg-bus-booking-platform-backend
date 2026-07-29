"use strict";

function createCouponSearchService({ repository, policy, mapper, clock }) {
  return async function searchCoupons(input) {
    const invalid = policy.validateSearchQuery(input.query);
    if (invalid) return invalid;
    const searchQuery = {
      isActive: true,
      validFrom: { $lte: clock() },
      validTo: { $gte: clock() },
      $or: [
        { couponCode: { $regex: input.query, $options: "i" } },
        { title: { $regex: input.query, $options: "i" } },
        { description: { $regex: input.query, $options: "i" } },
      ],
    };
    const coupons = await repository.searchCoupons(searchQuery);
    const results = [];
    for (const coupon of coupons) {
      const count = await repository.countSearchUsage(
        input.userId,
        coupon._id
      );
      if (count < coupon.perUserLimit) {
        results.push(
          mapper.mapSearchCoupon(coupon, count, input.orderAmount)
        );
      }
    }
    return {
      statusCode: 200,
      body: {
        success: true,
        message: `Found ${results.length} coupon(s) matching your search.`,
        data: results,
      },
    };
  };
}

module.exports = { createCouponSearchService };
