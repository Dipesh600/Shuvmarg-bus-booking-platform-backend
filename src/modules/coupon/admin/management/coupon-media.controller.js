"use strict";

const createCouponMediaController = ({
  mediaService,
  console: output = console,
}) => {
  const uploadCouponImage = async (req, res) => {
    try {
      if (!req.files || !req.files.image) {
        return res.status(400).json({
          success: false,
          message: "No image file provided.",
        });
      }
      const result = await mediaService.upload(req.files.image);
      return res.status(200).json({
        success: true,
        message: "Image uploaded successfully",
        imageUrl: result.objectKey,
        previewUrl: result.previewUrl,
      });
    } catch (error) {
      output.error("uploadCouponImage error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to upload image.",
      });
    }
  };

  const deleteOrphanedCouponImage = async (req, res) => {
    try {
      const { objectKey } = req.body;
      if (!objectKey || typeof objectKey !== "string") {
        return res.status(400).json({
          success: false,
          message: "objectKey is required.",
        });
      }
      const result = await mediaService.deleteOrphan(objectKey);
      if (result.forbidden) {
        return res.status(403).json({
          success: false,
          message: "Cannot delete this object key.",
        });
      }
      return res.status(200).json({
        success: true,
        message: "Image removed from storage.",
      });
    } catch (error) {
      output.error("deleteOrphanedCouponImage error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to remove image.",
      });
    }
  };

  return { uploadCouponImage, deleteOrphanedCouponImage };
};

module.exports = { createCouponMediaController };
