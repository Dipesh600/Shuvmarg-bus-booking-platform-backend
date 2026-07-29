"use strict";

function validateCouponInput({ couponCode, orderAmount }) {
  if (!couponCode || !orderAmount) {
    return {
      statusCode: 400,
      body: {
        success: false,
        message: "Coupon code and order amount are required!",
      },
    };
  }
  const amount = parseFloat(orderAmount);
  if (isNaN(amount)) {
    return {
      statusCode: 400,
      body: {
        success: false,
        message: "Order amount must be a valid number!",
      },
    };
  }
  return { amount };
}

function userLimitMessage(count, limit) {
  return count === 1
    ? "You have already used this coupon"
    : `You can only use this coupon ${limit} times and you've used it ${count} times`;
}

function validateSearchQuery(query) {
  if (query && query.trim().length >= 2) return null;
  return {
    statusCode: 400,
    body: {
      success: false,
      message: "Search query must be at least 2 characters long!",
    },
  };
}

module.exports = {
  validateCouponInput,
  userLimitMessage,
  validateSearchQuery,
};
