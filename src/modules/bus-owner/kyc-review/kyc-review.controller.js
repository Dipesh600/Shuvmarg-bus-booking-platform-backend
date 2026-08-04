"use strict";

const mongoose = require("mongoose");

function getAuthenticatedReviewerId(req) {
  return req?.adminInfo?.id || req?.adminInfo?._id || req?.user?._id || req?.user?.id || null;
}

function createKycReviewController({ reviewService, notifyKycResult }) {
  async function updateBusOwnerKyc(req, res) {
    try {
      const id = req?.body?.id || req?.body?.busOwnerId;
      if (!id || typeof id !== "string" || id.trim() === "") {
        return res.status(400).json({ success: false, message: "Id is required!" });
      }
      if (!mongoose.Types.ObjectId.isValid(id.trim())) {
        return res.status(400).json({ success: false, message: "Invalid id format!" });
      }

      const reviewerId = getAuthenticatedReviewerId(req);
      if (!reviewerId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: Reviewer identity is required.",
        });
      }

      const result = await reviewService.reviewKyc(req.body, reviewerId);

      if (typeof notifyKycResult === "function") {
        await notifyKycResult(result);
      }

      return res.status(200).json({
        success: true,
        message: "Bus owner KYC updated successfully!",
        data: result.data,
      });
    } catch (err) {
      if (err && err.statusCode) {
        return res.status(err.statusCode).json({
          success: false,
          message: err.message,
        });
      }

      console.error("updateBusOwnerKyc error:", err);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error!",
      });
    }
  }

  return {
    updateBusOwnerKyc,
    getAuthenticatedReviewerId,
  };
}

module.exports = { createKycReviewController };
