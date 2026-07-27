"use strict";

const EDITABLE_FIELDS = [
  "couponCode",
  "title",
  "description",
  "category",
  "imageUrl",
  "designConfig",
  "discountType",
  "discountValue",
  "minOrderAmount",
  "maxDiscountAmount",
  "validFrom",
  "validTo",
  "totalUsageLimit",
  "perUserLimit",
  "applicableRoutes",
  "excludedRoutes",
  "applicableUserTypes",
  "isActive",
];

const validateCreate = (input) => {
  const required = [
    ["couponCode", "Coupon Code"],
    ["title", "Title"],
    ["discountType", "Discount Type"],
    ["discountValue", "Discount Value"],
    ["validFrom", "Valid From Date"],
    ["validTo", "Valid To Date"],
  ];
  const missing = required.find(([field]) => !input[field]);
  if (missing) return `${missing[1]} is required!`;
  if (!["percentage", "fixed"].includes(input.discountType)) {
    return "Discount type must be either 'percentage' or 'fixed'!";
  }
  if (
    input.discountType === "percentage" &&
    (input.discountValue < 0 || input.discountValue > 100)
  ) {
    return "Percentage discount must be between 0 and 100!";
  }
  if (input.discountType === "fixed" && input.discountValue < 0) {
    return "Fixed discount amount must be positive!";
  }
  if (new Date(input.validFrom) >= new Date(input.validTo)) {
    return "Valid from date must be before valid to date!";
  }
  return null;
};

const validateUpdate = (coupon, updates) => {
  if (
    updates.discountType &&
    !["percentage", "fixed"].includes(updates.discountType)
  ) {
    return "Discount type must be either 'percentage' or 'fixed'!";
  }
  if (updates.validFrom || updates.validTo) {
    const from = new Date(updates.validFrom || coupon.validFrom);
    const to = new Date(updates.validTo || coupon.validTo);
    if (from >= to) return "Valid from date must be before valid to date!";
  }
  return null;
};

const applyEditableUpdates = (coupon, updates) => {
  for (const key of EDITABLE_FIELDS) {
    if (!(key in updates)) continue;
    coupon[key] =
      key === "couponCode" ? updates[key].toUpperCase() : updates[key];
    if (typeof updates[key] === "object" && updates[key] !== null) {
      coupon.markModified(key);
    }
  }
};

module.exports = {
  EDITABLE_FIELDS,
  validateCreate,
  validateUpdate,
  applyEditableUpdates,
};
