"use strict";

const createCouponMediaService = ({
  uploadFileToS3,
  buildS3Path,
  getDisplayUrl,
  deleteFromS3,
  imageKeyPolicy,
}) => ({
  async upload(file) {
    const folderPath = buildS3Path({ type: "coupon_image" });
    const objectKey = await uploadFileToS3(file, folderPath);
    const previewUrl = await getDisplayUrl(objectKey);
    return { objectKey, previewUrl };
  },

  async deleteOrphan(objectKey) {
    const normalizedKey = imageKeyPolicy.normalizeKey(objectKey);
    if (!normalizedKey.startsWith("platform/coupons/")) {
      return { forbidden: true };
    }
    await deleteFromS3(objectKey);
    return { forbidden: false };
  },

  cleanupReplacedImage(oldImageKey, newImageKey) {
    if (!oldImageKey || !oldImageKey.startsWith("platform/coupons/")) return;
    const normalizedOld = imageKeyPolicy.normalizeKey(oldImageKey);
    if (newImageKey === normalizedOld) return;
    deleteFromS3(normalizedOld).catch((error) =>
      console.warn(
        "[updateCoupon] Failed to delete old coupon image:",
        normalizedOld,
        error?.message
      )
    );
  },
});

module.exports = { createCouponMediaService };
