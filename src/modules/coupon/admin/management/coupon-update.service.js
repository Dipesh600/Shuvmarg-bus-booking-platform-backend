"use strict";

const createCouponUpdateService = ({
  repository,
  policy,
  imageKeyPolicy,
  mediaService,
  mapper,
}) => {
  const update = async (id, updates, adminInfo) => {
    const coupon = await repository.findById(id);
    if (!coupon) {
      return {
        statusCode: 404,
        body: { success: false, message: "Coupon not found!" },
      };
    }
    const validationMessage = policy.validateUpdate(coupon, updates);
    if (validationMessage) {
      return { statusCode: 400, body: { success: false, message: validationMessage } };
    }
    const oldImageKey = imageKeyPolicy.storedImageKey(coupon.imageUrl);
    policy.applyEditableUpdates(coupon, updates);
    coupon.lastModifiedBy = adminInfo.id;
    const updatedCoupon = await coupon.save();
    if ("imageUrl" in updates) {
      mediaService.cleanupReplacedImage(oldImageKey, updates.imageUrl);
    }
    return {
      statusCode: 200,
      body: {
        success: true,
        message: "Coupon updated successfully!",
        data: mapper.updateCouponData(updatedCoupon),
      },
    };
  };
  return { update };
};

module.exports = { createCouponUpdateService };
