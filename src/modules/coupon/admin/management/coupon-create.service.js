"use strict";

const createCouponCreationService = ({
  repository,
  policy,
  mapper,
  offerNotification,
}) => {
  const create = async (input, adminInfo) => {
    const validationMessage = policy.validateCreate(input);
    if (validationMessage) {
      return { statusCode: 400, body: { success: false, message: validationMessage } };
    }
    const couponCode = input.couponCode.toUpperCase();
    if (await repository.findByCode(couponCode)) {
      return {
        statusCode: 400,
        body: { success: false, message: "Coupon code already exists!" },
      };
    }
    const savedCoupon = await repository.create({
      couponCode,
      title: input.title,
      description: input.description,
      category: input.category,
      imageUrl: input.imageUrl,
      discountType: input.discountType,
      discountValue: input.discountValue,
      minOrderAmount: input.minOrderAmount || 0,
      maxDiscountAmount: input.maxDiscountAmount || null,
      validFrom: new Date(input.validFrom),
      validTo: new Date(input.validTo),
      totalUsageLimit: input.totalUsageLimit || null,
      perUserLimit: input.perUserLimit || 1,
      applicableRoutes: input.applicableRoutes || [],
      excludedRoutes: input.excludedRoutes || [],
      applicableUserTypes: input.applicableUserTypes || [],
      designConfig: input.designConfig || undefined,
      createdBy: adminInfo.id,
      lastModifiedBy: adminInfo.id,
    });
    offerNotification(
      savedCoupon.couponCode,
      savedCoupon.title,
      savedCoupon.discountType,
      savedCoupon.discountValue
    ).catch(() => {});
    return {
      statusCode: 201,
      body: {
        success: true,
        message: "Coupon created successfully!",
        data: mapper.createCouponData(savedCoupon),
      },
    };
  };
  return { create };
};

module.exports = { createCouponCreationService };
